const esbuild = require("esbuild");
const chalk = require("chalk");
const mfs = require("micro-fs");
const path = require("path");
const fs = require('fs');
const request = require("request");
const commandLineArgs = require("command-line-args");
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
	console.log(chalk`Uploading xar {cyan ${sourcePath}} to ${servers[args.deploy].server}`);
	fs.createReadStream(sourcePath).pipe(
		request(
			options,
			function (error, response) {
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
				request(options, function (error, response, body) {
					if (error || !(response.statusCode == 200 || response.statusCode == 201)) {
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
	
    await mfs.copy("./scripts/xqlint/build.js", "./support/xqlint/build.js");
	await mfs.copy("./scripts/xqlint/main.js", "./support/xqlint/main.js");
}

async function clean() {
    console.log(chalk.blue('Cleaning files ...'));
    await mfs.delete([
        'resources/scripts/eXide.min.*',
        'resources/scripts/jquery/jquery.plugins.min.js', 
        'resources/scripts/xqlint.min.js', 
        'resources/scripts/ace/**',
        'index.html',
        'expath-pkg.xml'
    ], { allowEmpty: true, silent: false });
}

async function bundle() {
    console.log(chalk.blue('Bundling eXide source files ...'));
    await esbuild
		.build({
			entryPoints: ["./scripts/bundle.js"],
			outfile: "./resources/scripts/eXide.min.js",
			bundle: true,
			minify: !args.dev,
			sourcemap: !args.dev,
			external: ["ace/*", "lib/*", "eXide/mode/*"],
			logLevel: "info",
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});

    console.log(chalk.blue("Bundling jQuery plugins ..."));
	await esbuild
		.build({
			entryPoints: ["./scripts/libs.bundle.js"],
			outfile: "./resources/scripts/jquery/jquery.plugins.min.js",
			bundle: true,
			minify: !args.dev,
			logLevel: "info",
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}

function replace(path, outPath, data) {
    const content = fs.readFileSync(`${__dirname}/../${path}`, "utf-8");
    const replaced = content.toString().replace(/{{(.*)?}}/g, function (match, p1) {
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

    await mfs.copy('./support/ace/build/src-min/**', './resources/scripts/ace');
    
    replace('expath-pkg.xml.tmpl', 'expath-pkg.xml', { version });
    replace("index.html.tmpl", "index.html", { version });

    await bundle();    

    console.log(chalk`Creating xar {cyan eXide-${version}.xar}`);
    mfs.zip(
		[
			"*.*",
			"modules/**/*",
			"resources/**/*",
			"templates/**/*",
			"src/**/*",
			"docs/**/*",
			"!.git*",
			"!*.tmpl",
			"!*.properties",
			"!.github/**",
			"!node_modules/**",
			"!package-lock.json",
			"!cypress/**",
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