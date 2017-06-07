#!/usr/bin/env node

'use strict'

const __doc__ = `
Usage:
  greni [-C PATH] [--debug]
  greni init <name>
  greni -h | --help
  greni --version

Options:
  -h --help     Show this screen.
  --version     Show version.
  -C PATH       Look for the project metadata under the given path.
  --debug       Do not minify generated source, and turn on runtime warnings.
`

const version = require('./package.json').version

const fs = require('fs')
const pathModule = require('path')
const process = require('process')

const docopt = require('docopt')
const eslint = require('eslint')
const eslintConfigErrors = require('./eslint-config-errors')
const minify = require('uglify-es').minify
const rollup = require('rollup')
const rollupBuble = require('rollup-plugin-buble')
const rollupNodeResolve = require('rollup-plugin-node-resolve')
const sorcery = require('sorcery')
const svelte = require('svelte')

const SVELTE_PATH = require.resolve('svelte/shared.js')

function tryLoadJSON(path, defaultIfEmpty) {
    try {
        const data = fs.readFileSync(path)
        if (data.length === 0) {
            return defaultIfEmpty
        }

        return JSON.parse(data)
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null
        }

        throw new Error(`Error parsing JSON file "${path}": ${error}`)
    }
}

function computeComponentOutputPath(root, componentPath, debugMode) {
    const buildMode = debugMode ? 'debug' : 'prod'
    return pathModule.resolve(`${root}/${componentPath.replace(/\.html$/, '.js')}.${buildMode}`)
}

function loadManifest(path) {
    const rootConfig = tryLoadJSON(path, {})
    if (!rootConfig || !rootConfig.greniConfig) { return null }

    const config = rootConfig.greniConfig
    if (config.output === undefined) {
        config.output = './output'
    }
    config.output = config.output.replace(/\/+$/, '')

    if (config.dependencies === undefined) {
        config.dependencies = []
    }

    if (config.entryPoints === undefined) {
        config.entryPoints = {}
    }

    if (typeof config.entryPoints !== 'object' || Array.isArray(config.entryPoints)) {
        throw new Error(`Configuration "entryPoints" must be an object. Got ${config.entryPoints}`)
    }

    if (config.debugMode === undefined) {
        config.debugMode = false
    }

    if (config.eslint === undefined) {
        config.eslint = true
    }

    if (config.buble === undefined) {
        config.buble = null
    }

    // Internal state
    config._componentPaths = {}
    return config
}

function formatPackageTemplate(name) {
    return `{
    "name": ${JSON.stringify(name)},
    "greniConfig": {
        "entryPoints": {
            "index.js": "src/index.js"
        }
    }
}`
}

function fileExists(path) {
    try {
        fs.statSync(path)
        return path
    } catch (error) {
        return null
    }
}

function makeDirsSync(path) {
    path = pathModule.resolve(path)

    try {
        fs.mkdirSync(path)
    } catch (error) {
        if (error.code === 'ENOENT') {
            makeDirsSync(pathModule.dirname(path))
            makeDirsSync(path)
        } else {
            try {
                const stat = fs.statSync(path)
                if (!stat.isDirectory()) { throw error }
            } catch (err) {
                throw error
            }
        }
    }
}

function rollupUglify(options = {}) {
    return {
        name: 'uglify',
        transformBundle (code) {
            const result = minify(
                code,
                Object.assign({sourceMap: {url: 'out.js.map'}}, options)
            )

            if (result.map) {
                const commentPos = result.code.lastIndexOf('//#')
                result.code = result.code.slice(0, commentPos).trim()
            }

            result.names = []
            return result
        }
    }
}

function rollupEslint(options, filter) {
    const cli = new eslint.CLIEngine(options);
    const formatter = cli.getFormatter('stylish')

    return {
        name: 'eslint',
        transform(code, id) {
            const file = pathModule.relative(process.cwd(), id).split(pathModule.sep).join('/')
            if (!filter(id)) {
                return null
            }

            const report = cli.executeOnText(code, file)
            if (!report.errorCount && !report.warningCount) {
                return null
            }

            const result = formatter(report.results)
            if (result) {
                console.log(result)
            }

            if (report.errorCount) {
                throw Error('Errors were found')
            }

            return null
        }
    }
}

function compileSvelte(config, component) {
    const outputPath = computeComponentOutputPath(config.output, component, config.debugMode)
    console.log(`svelte ${component} -> ${outputPath}`)

    config._componentPaths[pathModule.resolve(component.replace(/\.html$/, '.js'))] = outputPath
    makeDirsSync(pathModule.dirname(outputPath))

    const srcMtime = fs.statSync(component).mtime
    let destMtime = 0
    try {
        destMtime = fs.statSync(outputPath).mtime
    } catch (error) {}

    if (destMtime >= srcMtime) {
        return outputPath
    }

    const options = {
        dev: config.debugMode === true,
        filename: component,
        format: 'es',
        name: pathModule.basename(component, '.html'),
        shared: true
    }

    const inputText = fs.readFileSync(component, {encoding: 'utf-8'})
    const compiled = svelte.compile(inputText, options)
    const code = `${compiled.code}\n//# sourceMappingURL=${compiled.map.toUrl()}\n`;
    fs.writeFileSync(outputPath, code)

    return outputPath
}

function rollupIncludePaths(config) {
    // When resolving imports within a component, we should look relative to the component's
    // original source path, not the path of the built artifact. This index allows us
    // to look up a source path from a built artifact.
    const originLookup = new Map()

    function searchProjectModule(file) {
        const workingDir = process.cwd()

        let newPath = fileExists(pathModule.resolve(workingDir, '', file))
        if (newPath) { return newPath }

        newPath = fileExists(pathModule.resolve(workingDir, '', file, 'index'))
        return newPath
    }

    return {
        resolveId: function (file, origin) {
            if (origin === undefined) {
                return searchProjectModule(file)
            }

            if (file === 'svelte/shared.js') {
                return SVELTE_PATH
            }

            origin = pathModule.dirname(origin)

            if (/\.html$/.test(file)) {
                // This is a Svelte component
                if (originLookup.has(origin)) {
                    origin = originLookup.get(origin)
                }

                const path = pathModule.join(origin, file)
                const outputPath = compileSvelte(config, path)
                const outputDir = pathModule.dirname(outputPath)
                originLookup.set(outputDir, pathModule.join(origin, pathModule.dirname(file)))
                return outputPath
            }

            const path = pathModule.join(origin, file)
            if (config._componentPaths[path] !== undefined) {
                return config._componentPaths[path]
            }

            return fileExists(path)
        }
    }
}

function compileRollup(config) {
    // Don't lint components or node_modules
    function lintFilter(id) {
        if (id.indexOf('/node_modules/') >= 0) {
            return false
        }

        for (let key of Object.keys(config._componentPaths)) {
            key = config._componentPaths[key]
            if (id.indexOf(key) >= 0) {
                return false
            }
        }

        return true
    }

    const entryPoints = config.entryPoints
    const promises = []
    const plugins = []

    plugins.push(rollupIncludePaths(config), rollupNodeResolve())

    if (config.eslint) {
        const eslintConfig = {}
        Object.assign(eslintConfig, eslintConfigErrors)
        plugins.push(rollupEslint(eslintConfig, lintFilter))
    }

    if (config.buble) {
        plugins.push(rollupBuble(config.buble))
    }

    if (!config.debugMode) {
        plugins.push(rollupUglify())
    }

    for (const output of Object.keys(entryPoints)) {
        const entryPoint = entryPoints[output]
        const outputPath = `${config.output}/${output}`
        console.log(`rollup ${entryPoint} -> ${outputPath}`)

        promises.push(rollup.rollup({
            entry: entryPoint,
            plugins: plugins
        }).then((bundle) => bundle.write({
            dest: outputPath,
            format: 'iife',
            sourceMap: 'inline'
        })))
    }

    return Promise.all(promises)
}

function compileSorcery(config) {
    for (let output of Object.keys(config.entryPoints)) {
        output = pathModule.join(config.output, output)
        console.log(`sorcery ${output}`)
        sorcery.load(output).then((chain) => {
            chain.write()
        })
    }

    return new Promise((resolve) => resolve())
}

function build(config) {
    try {
        fs.mkdirSync(config.output)
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw new Error(`Failed to create output directory ${config.output}: ${error.code}`)
        }
    }

    return compileRollup(config).then(() => compileSorcery(config))
}

function main() {
    const args = docopt.docopt(__doc__)
    if (args['--version']) {
        console.log(`greni ${version}`)
    } else if (args.init) {
        const name = args['<name>']
        try {
            fs.mkdirSync(name)
            fs.mkdirSync(pathModule.join(name, 'src'))
        } catch (error) {
            console.error(`Failed to create ${name}: ${error.code}`)
            process.exit(1)
        }

        process.chdir(name)
        fs.writeFileSync('package.json', formatPackageTemplate(name))
        fs.writeFileSync('src/index.js', '')
    } else {
        if (args['-C']) {
            process.chdir(args['-C'])
        }

        const config = loadManifest('package.json', {})
        if (!config) {
            throw new Error('Failed to find "greniConfig" key in "package.json".')
        }

        if (args['--debug']) {
            config.debugMode = true
        }

        build(config).then(() => console.log('Done!')).catch((error) => {
            if (error.toString() !== 'Warnings or errors were found') {
                console.error(error)
            }

            process.exit(1)
        })
    }
}

main()
