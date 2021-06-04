const esbuild = require("esbuild");
const chalk = require("chalk");
const mfs = require("micro-fs");
const path = require("path");
const fs = require('fs');
const commandLineArgs = require("command-line-args");
const { version } = require("../package.json");

const options = commandLineArgs([
    { name: "command", type: String, defaultOption: true, defaultValue: 'build' },
    { name: "dev", type: Boolean }
]);

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
			minify: !options.dev,
			sourcemap: !options.dev,
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
			minify: !options.dev,
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
    if (options.command === 'clean') {
        await clean();
        return;
    } else if (options.command === 'prepare') {
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
	).then(() => console.log(chalk.bold('DONE.')));
})();