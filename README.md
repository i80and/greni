# greni [![npm version](https://badge.fury.io/js/greni.svg)](https://badge.fury.io/js/greni)
A batteries-included way to quickly build modern, fast, single-page applications

## Introduction

`greni` is the Icelandic word for the den of a fox. It is also a build tool that
intelligently concatenates a pipeline of the following tools:

* [svelte](http://svelte.technology)
* [rollup.js](http://rollupjs.org)
* [eslint](http://eslint.org)
* [bublé](http://buble.surge.sh)
* [UglifyJS2 Harmony](https://www.npmjs.com/package/uglify-js-harmony)
* [sorcery](https://www.npmjs.com/package/sorcery)

`greni` is *cunning*, and avoids rebuilding your `svelte` component files unless
they have changed or the build configuration (i.e. `debug` vs `production`) has
changed.

## Usage

Create a `greni.json` file, and populate it with contents such as the following:

    {
        "components": ["src/components/Card.html", "src/components/App.html"],
        "entryPoints": {"index.js": "src/index.js"},
    }

You can also put this in your `package.json` under the `greniConfig` key:

    {
        "greniConfig": {
            "output": "output/",
            "components": ["src/components/Card.html", "src/components/App.html"],
            "entryPoints": {"index.js": "src/index.js"}
        }
    }

Run `greni` or `greni --debug` to build the following artifacts:

* `output/index.js`
* `output/index.js.map`

To automatically rebuild when your source files change, use the
[entr](http://entrproject.org/) utility:

    while true; do find src/ -type f | entr -d greni; done

## Future Plans

`greni` may someday become the central tool for building
[Vixeno](https://vixeno.com) apps, and house a repository of common
components.
