const esbuild = require("esbuild");
const chalk = require("chalk").default;
const path = require("path");
const fs = require('fs');
const fsp = require('fs').promises;
const request = require("request");
const commandLineArgs = require("command-line-args");
const globStream = require("glob-stream");
const yazl = require("yazl");
const { version } = require("../package.json");
const { servers } = require('../.existdb.json');

const args = commandLineArgs([
    { name: "command", type: String, defaultOption: true, defaultValue: 'build' },
    { name: "dev", type: Boolean },
	{ name: "deploy", type: String }
]);

function deploy() {
	const fileName = `eXide-${version}.xar`;
	const sourcePath = path.join(__dirname, `../build/eXide-${version}.xar`);
	const targetPath = `/db/system/repo/${fileName}`;
	const url = `${servers[args.deploy].server}/rest${targetPath}`;
	const options = {
		uri: url,
		method: "PUT",
		strictSSL: false,
		headers: {
			"Content-Type": "application/octet-stream",
		},
		auth: {
			user: servers[args.deploy].user,
			pass: servers[args.deploy].password,
			sendImmediately: true,
		},
	};
	console.log(`Uploading xar ${chalk.cyan(sourcePath)} to ${servers[args.deploy].server}`);
	fs.createReadStream(sourcePath).pipe(
		request(
			options,
			(error, response) => {
				if (error || response.statusCode !== 201) {
					console.error(`Upload failed with %s`, error);
				}
				const xquery = `
					xquery version "3.1";

					declare namespace expath="http://expath.org/ns/pkg";
					declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";
					declare option output:method "json";
					declare option output:media-type "application/json";

					declare variable $repo := "http://demo.exist-db.org/exist/apps/public-repo/modules/find.xql";

					declare function local:remove($package-url as xs:string) as xs:boolean {
						if ($package-url = repo:list()) then
							let $undeploy := repo:undeploy($package-url)
							let $remove := repo:remove($package-url)
							return
								$remove
						else
							false()
					};

					let $xarPath := "${targetPath}"
					let $meta :=
						try {
							compression:unzip(
								util:binary-doc($xarPath),
								function($path as xs:anyURI, $type as xs:string,
									$param as item()*) as xs:boolean {
									$path = "expath-pkg.xml"
								},
								(),
								function($path as xs:anyURI, $type as xs:string, $data as item()?,
									$param as item()*) {
									$data
								}, ()
							)
						} catch * {
							error(xs:QName("local:xar-unpack-error"), "Failed to unpack archive")
						}
					let $package := $meta//expath:package/string(@name)
					let $removed := local:remove($package)
					let $installed := repo:install-and-deploy-from-db($xarPath, $repo)
					return
						repo:get-root()
				`;
				const url = `${servers[args.deploy].server}/rest/db?_query=${encodeURIComponent(xquery)}&_wrap=no`;
				const options = {
					uri: url,
					method: "GET",
					json: true,
					auth: {
						user: servers[args.deploy].user,
						pass: servers[args.deploy].password,
						sendImmediately: true,
					},
				};
				console.log(chalk.cyan('Installing xar ...'));
				request(options, (error, response, body) => {
					if (error || !(response.statusCode === 200 || response.statusCode === 201)) {
						console.error(`Installation failed with %s`, error);
					} else {
						console.log('DONE');
					}
				});
			}
		)
	);
}

async function prepare() {
	const buildDir = path.join(__dirname, "..", "build");
	if (!fs.existsSync(buildDir)) {
		fs.mkdirSync(buildDir);
	}
}

function collectGlobs (globs, options) {
    return new Promise((resolve, reject) => {
        const list = [];
        const stream = globStream(globs, options || {});
        stream.on('data', (file) => list.push(file));
        stream.on('error', reject);
        stream.on('end', () => resolve(list));
    });
}

async function clean() {
    console.log(chalk.blue('Cleaning files ...'));
    const files = await collectGlobs([
        'resources/scripts/eXide.min.*',
        'resources/scripts/chunks/**',
        'resources/scripts/prettier-bundle.js',
        'index.html',
        'expath-pkg.xml',
        'repo.xml'
    ], { allowEmpty: true });
    for (const file of files) {
        await fsp.rm(file.path, { force: true });
    }
}

async function bundle() {
    console.log(chalk.blue('Bundling eXide source files ...'));
    // eXide's sources are ES modules. The bundle is loaded with <script type="module">;
    // code splitting turns dynamic imports (the XQuery 4.0 parser) into lazily
    // loaded chunks next to it.
    await esbuild
		.build({
			entryPoints: { "eXide.min": "./scripts/bundle.js" },
			outdir: "./resources/scripts",
			chunkNames: "chunks/[name]-[hash]",
			format: "esm",
			splitting: true,
			bundle: true,
			minify: !args.dev,
			sourcemap: !args.dev,
			external: ["lib/*"],
			logLevel: "info",
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}


function zipFiles (globs, dest, options) {
    const zip = new yazl.ZipFile();
    return collectGlobs(globs, options).then((files) => {
        files.forEach((file) => {
            if (!fs.statSync(file.path).isFile()) return;
            const relative = path.relative(file.base, file.path);
            zip.addFile(file.path, relative);
        });
        return new Promise((resolve, reject) => {
            const stream = fs.createWriteStream(dest);
            stream.on('close', resolve);
            stream.on('error', reject);
            zip.outputStream.pipe(stream);
            zip.end();
        });
    });
}

function replace(path, outPath, data) {
    const content = fs.readFileSync(`${__dirname}/../${path}`, "utf-8");
    const replaced = content.toString().replace(/{{(.*)?}}/g, (match, p1) => {
		return data[p1] || "";
	});
    fs.writeFileSync(`${__dirname}/../${outPath}`, replaced);
}

(async () => {
    if (args.command === 'clean') {
        await clean();
        return;
    } else if (args.command === 'prepare') {
        await prepare();
        return;
    }

    replace('expath-pkg.xml.tmpl', 'expath-pkg.xml', { version });
    replace("index.html.tmpl", "index.html", { version });
    replace('repo.xml.tmpl', 'repo.xml', { version });

    await bundle();    

    console.log(`Creating xar ${chalk.cyan(`eXide-${version}.xar`)}`);
    zipFiles(
		[
			"*.*",
			"modules/**/*",
			"resources/**/*",
			"templates/**/*",
			"docs/**/*",
			"!.git*",
			"!*.tmpl",
			"!*.properties",
			"!.github/**",
			"!node_modules/**",
			"!package-lock.json",
			"!cypress/**",
			"!scripts/**",
			"!tools/**",
			"!test/**",
			"!support/**",
			"!src/**",
			"!resources/scripts/**/*.map",
			"!resources/images/background.gif",
			"!resources/images/fullscreen.png",
			"!resources/images/layouts_split.png",
			"!resources/images/layouts_split_vertical.png",
			"!resources/images/header.gif",
			"!resources/images/exide.png",
			"!resources/images/exide.svg",
			"!resources/images/toggle-dn.gif",
			"!resources/images/toggle-lt.gif",
			"!resources/images/toggle-up.gif",
			"!resources/images/toggle-rt.gif",
			"!resources/css/font-awesome/fonts/fontawesome-webfont.svg",
			"!resources/css/font-awesome/fonts/fontawesome-webfont.ttf",
			"!resources/css/font-awesome/fonts/FontAwesome.otf",
			"!resources/css/font-awesome/fonts/fontawesome-webfont.eot",
			"!CLAUDE.md",
			"!grammars/**",
			"!build.js",
		],
		`build/eXide-${version}.xar`,
		{ base : '.' }
	).then(() => {
		console.log(chalk.bold('DONE.'));
		if (args.deploy) {
			deploy();
		}
	});
})();