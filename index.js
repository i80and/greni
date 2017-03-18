#!/usr/bin/env node

'use strict'

const __doc__ = `
Usage:
  greni [-C PATH] [--debug]
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
const minify = require('uglify-js-harmony').minify
const rollup = require('rollup')
const rollupBuble = require('rollup-plugin-buble')
const rollupEslint = require('rollup-plugin-eslint')
const rollupNodeResolve = require('rollup-plugin-node-resolve')
const rollupUglify = require('rollup-plugin-uglify')
const sorcery = require('sorcery')
const svelte = require('svelte')

function tryLoadJSON(path) {
    try {
        return JSON.parse(fs.readFileSync(path))
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null
        }

        throw new Error(`Error parsing JSON file "${path}": ${error}`)
    }
}

function fileExists(path) {
    try {
        fs.statSync(path)
        return path
    } catch (error) {
        return null
    }
}

function rollupIncludePaths(config) {
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

            origin = pathModule.dirname(origin)
            const path = pathModule.join(origin, file)
            if (config._componentPaths[path] !== undefined) {
                return config._componentPaths[path]
            }

            return fileExists(path)
        }
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

function compileSvelte(config) {
    const components = config.components
    for (const component of components) {
        const outputPath = pathModule.resolve(`${config.output}/${component}`.replace(/\.html$/, '.js'))
        const buildMode = config.debugMode ? 'debug' : 'prod'
        const underlyingOutputPath = `${outputPath}.${buildMode}`
        console.log(`svelte ${buildMode} ${component} -> ${outputPath}`)

        config._componentPaths[pathModule.resolve(component.replace(/\.html$/, '.js'))] = outputPath
        makeDirsSync(pathModule.dirname(outputPath))

        while (true) {
            try {
                fs.symlinkSync(underlyingOutputPath, outputPath)
                break
            } catch (error) {
                if (error.code === 'EEXIST') {
                    fs.unlinkSync(outputPath)
                    continue
                }

                throw new Error(`Failed to link ${outputPath} -> ${underlyingOutputPath}: ${error}`)
            }
        }

        const srcMtime = fs.statSync(component).mtime
        let destMtime = 0
        try {
            destMtime = fs.statSync(outputPath).mtime
        } catch (error) {}

        if (destMtime >= srcMtime) {
            continue
        }

        const options = {
            dev: config.debugMode === true,
            format: 'es',
            name: pathModule.basename(component, '.html'),
            shared: true
        }

        const inputText = fs.readFileSync(component, {encoding: 'utf-8'})
        const compiled = svelte.compile(inputText, options)
        const code = `${compiled.code}\n//# sourceMappingURL=${compiled.map.toUrl()}\n`;
        fs.writeFileSync(underlyingOutputPath, code)
    }

    return new Promise((resolve) => resolve())
}

function compileRollup(config) {
    const entryPoints = config.entryPoints
    const promises = []
    const plugins = []

    if (config.eslint) {
        plugins.push(rollupEslint(config.eslint))
    }

    if (config.buble) {
        plugins.push(rollupBuble(config.buble))
    }

    if (!config.debugMode) {
        plugins.push(rollupUglify({}, minify))
    }

    plugins.push(rollupIncludePaths(config), rollupNodeResolve())

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
    const entryPoints = config.entryPoints
    for (let output of Object.keys(entryPoints)) {
        output = pathModule.join(config.output, output)
        console.log(`sorcery ${output}`)
        sorcery.load(output).then((chain) => {
            chain.write()
        })
    }

    return new Promise((resolve) => resolve())
}

function build(config) {
    if (config.output === undefined) {
        config.output = './output'
    }
    config.output = config.output.replace(/\/+$/, '')

    if (config.components === undefined) {
        config.components = []
    }

    if (config.entryPoints === undefined) {
        config.entryPoints = {}
    }

    if (config.debugMode === undefined) {
        config.debugMode = false
    }

    if (config.eslint === undefined) {
        config.eslint = true
    }

    if (config.buble === undefined) {
        config.buble = false
    }

    // Internal state
    config._componentPaths = {}

    try {
        fs.mkdirSync(config.output)
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw new Error(`Failed to create output directory ${config.output}: ${error.code}`)
        }
    }

    compileSvelte(config).then(() => compileRollup(config)).then(() => compileSorcery(config)).then(() => {
        console.log('Done!')
    }).catch((error) => {
        console.error(error)
    })
}

function main() {
    const args = docopt.docopt(__doc__)
    if (args['--version']) {
        console.log(`greni ${version}`)
    } else {
        if (args['-C']) {
            process.chdir(args['-C'])
        }

        let config = tryLoadJSON('greni.json')
        if (!config) {
            config = tryLoadJSON('package.json')
            if (!config) {
                throw new Error('Failed to find configuration file. Create "greni.json".')
            }

            config = config.greniConfig
            if (!config) {
                throw new Error('Failed to find "greniConfig" key in "package.json". ' +
                                'Either create "greni.json" or add "greniConfig" to your "package.json".')
            }
        }

        if (args['--debug']) {
            config.debugMode = true
        }

        build(config)
    }
}

main()
