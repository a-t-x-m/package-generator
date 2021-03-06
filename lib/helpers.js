const { access, constants } = require('fs');
const { basename, dirname, extname, join, resolve } = require('path');
const { promisify } = require('util');
const pkgDir = require('pkg-dir');
const spdxLicenseList = require('spdx-license-list/full');
const terminalLink = require('terminal-link');

const accessAsync = promisify(access);

// Create array of license choices
function getLicenses() {
  const spdxCodes = Object.getOwnPropertyNames(spdxLicenseList).sort();

  return spdxCodes.map(obj => {
    const licenses = {};

    licenses['name'] = terminalLink(obj, `https://spdx.org/licenses/${obj}.html`, {
      fallback() {
        return obj;
      }
    });

    licenses['value'] = obj;

    return licenses;
  }) || [];
}

async function fileExists(filePath) {
  try {
    await accessAsync(filePath, constants.F_OK)
    return true;
  } catch (error) {
    return false;
  }
}

async function getTemplatePath(filePath, selectedLanguage) {
  const rootDir = await pkgDir(__dirname);
  const languagePath = resolve(rootDir, 'generators/app/templates', selectedLanguage, filePath);
  const sharedPath = resolve(rootDir, 'generators/app/templates', 'shared', filePath);

  if (await fileExists(languagePath)) {
    return join(selectedLanguage, filePath);
  } else if (await fileExists(sharedPath)) {
    return join(sharedPath, filePath);
  } else {
    throw Error(`No template file found for ${filePath}`);
  }
}

function getDestinationPath(filePath, selectedLanguage) {
  const dirName = dirname(filePath);
  const extName = extname(filePath);
  const baseName = basename(filePath, extName);

  switch (selectedLanguage.toLowerCase()) {
    case 'typescript':
      return `${dirName}/${baseName}.ts`;

    case 'javascript':
      return `${dirName}/${baseName}.js`;

    case 'coffeescript':
      return `${dirName}/${baseName}.coffee`;

    default:
      throw Error('Unsupported language selected');
  }
}

function getDependencies(props) {
  let dependencies = [];
  let devDependencies = [
    'husky',
    'lint-staged',
    'jsonlint',
    'npm-run-all',
    'prettierx',
    'source-map-explorer',
    'stylelint'
  ];

  if (props.bundler === 'webpack') {
    devDependencies.push(
      'sass-loader',
      'style-loader',
      'css-loader',
      'webpack-cli',
      'webpack'
    );

    if (props.language === 'coffeescript') devDependencies.push('coffee-loader');
  } else if (props.bundler === 'rollup') {
    devDependencies.push(
      'rollup',
      '@rollup/plugin-babel',
      '@rollup/plugin-commonjs',
      '@rollup/plugin-json',
      '@rollup/plugin-node-resolve',
      'rollup-plugin-scss',
      'rollup-plugin-terser',
    );

    if (props.language === 'coffeescript') devDependencies.push('rollup-plugin-coffee-script');
    if (props.language === 'typescript') devDependencies.push('@rollup/plugin-typescript');
  }

  if (props.additionalDependencies && props.additionalDependencies.length) {
    devDependencies.push(props.additionalDependencies.map(additionalDependency => additionalDependency));
  }

  switch (props.language) {
    case 'coffeescript':
      devDependencies.push(
        'coffeelint@2',
        'coffeescript@2'
      );

      break;

    case 'javascript':
      devDependencies.push(
        '@babel/core',
        '@babel/eslint-parser',
        '@babel/plugin-proposal-export-namespace-from',
        '@babel/preset-env',
        'core-js@3',
        'eslint-plugin-json',
        'eslint-plugin-node',
        'eslint',
        `eslint-config-${props.eslintConfig}`,
      );

      if (props.bundler === 'webpack') devDependencies.push('babel-loader');

      if (props.babelPresets?.length) {
        devDependencies.push(props.babelPresets.map(preset => preset));
      }

      break;

    case 'typescript':
      devDependencies.push(
        '@babel/core',
        '@babel/eslint-parser',
        '@babel/plugin-proposal-export-namespace-from',
        '@babel/preset-env',
        '@types/atom',
        '@types/node',
        '@typescript-eslint/eslint-plugin',
        '@typescript-eslint/parser',
        'core-js@3',
        'eslint',
        `eslint-config-${props.eslintConfig}`,
        'eslint-plugin-json',
        'tslib',
        'typescript',
      );

      if (props.bundler === 'webpack') devDependencies.push('ts-loader');

      break;
  }

  if (props.features.includes('styles')) {
    devDependencies.push(
      'stylelint',
      `stylelint-config-${props.stylelintConfig}`
    );
  }

  return [
    dependencies.sort(),
    devDependencies.sort()
  ];
}

function getLanguageExtension(selectedLanguage) {
  switch (selectedLanguage.toLowerCase()) {
    case 'typescript':
      return 'ts';

    case 'javascript':
      return 'js';

    case 'coffeescript':
      return 'coffee';

    default:
      throw Error('Unsupported language selected');
  }
}

function getActivationHooks(props) {
  return props.activationHooks.map(hook => {
    switch (hook) {
      case 'core:loaded-shell-environment':
        return hook;

      case 'root-scope-used':
        return props.rootScopeUsed.endsWith(':root-scope-used')
          ? props.rootScopeUsed
          : `${props.rootScopeUsed}:root-scope-used`;

      case 'grammar-used':
        return props.grammarUsed.endsWith(':root-scope-used')
          ? props.grammarUsed
          : `${props.grammarUsed}:grammar-used`;
    }
  });
}

function getWatchScript(props) {
  if (!props.features.includes('code')) {
    return 'echo "Nothing to watch"';
  }

  switch (props.bundler) {

    case 'webpack':
      return 'webpack --watch --mode none';

    case 'rollup':
      return 'rollup --watch --config';

    default:
      throw new Error(`Unsupported bundler '${props.bundler}'`);
  }
}

function getBuildScript(props) {
  if (!props.features.includes('code')) {
    return 'echo "Nothing to build"';
  }

  switch (props.bundler) {

    case 'webpack':
      return 'webpack --mode production';

    case 'rollup':
      return 'rollup --config';

    default:
      throw new Error(`Unsupported bundler '${props.bundler}'`);
  }
}

function composeManifest(props) {
  const fileExtension = props.features.includes('code')
    ? getLanguageExtension(props.language)
    : '';

  return {
    'name': props.name,
    'version': '0.0.0',
    'description': props.description,
    'license': props.license,
    'private': props.private,
    'main':  props.features.includes('code') && './lib/main',
    'scripts': {
        'analyze': props.features.includes('code')
          ? 'source-map-explorer lib/**/*.js'
          : 'echo "Nothing to analyze"',
        'build': getBuildScript(props),
        'dev': 'npm run start',
        'lint:code':
          props.features.includes('code')
            ? props.language === 'coffeescript'
              ? `coffeelint ./src`
              : `eslint --ignore-path .gitignore --no-error-on-unmatched-pattern ./src/**/*.${fileExtension}`
            : 'echo "Nothing to lint"',
        'lint:styles': props.features.includes('styles')
          ? 'stylelint --allow-empty-input styles/*.{css,less}'
          : 'echo "Nothing to lint"',
        'lint': `npm-run-all --parallel lint:*`,
        'postinstall': 'husky install',
        'prepublishOnly': 'npm run build',
        'start': getWatchScript(props),
        'test': props.features.includes('code')
          ? 'echo \'Error: no test specified\' && exit 1'
          : 'echo "Nothing to test"'
    },
    'keywords': [
    ],
    'repository': {
        'type': 'git',
        'url': `https://github.com/${props.author}/${props.repositoryName}`
    },
    'homepage': `https://atom.io/packages/${props.name}`,
    'bugs': {
        'url': `https://github.com/${props.author}/${props.repositoryName}/issues`
    },
    'engines': {
      'atom': '>=1.0.0 <2.0.0'
    },
    'activationCommands': {
      'atom-workspace': [
        props.features.includes('code') && props.activationCommands
          ? `${props.name}:hello-world`
          : undefined
      ]
    },
    'activationHooks': props.features.includes('code')
      ? getActivationHooks(props)
      : [],
    'workspaceOpeners': props.features.includes('code')
      ? props.workspaceOpenerURIs
      : [],
    'package-deps': props.features.includes('code')
      ? props.atomDependencies
      : [],
    'dependencies': {},
    'devDependencies': {},
    'lint-staged': getLintStaged(props),
  };
}

function composeBabel(props) {
  const babelPresets = props.babelPresets?.length
    ? props.babelPresets
    : [];

  return {
    'plugins': [
        '@babel/plugin-proposal-export-namespace-from'
    ],
    'presets': [
        [
            '@babel/preset-env', {
                'targets': {
                    'electron': '2.0.0',
                },
                'corejs': '3',
                'useBuiltIns': 'entry',
            }
        ],
        ...babelPresets
    ]
  }
}

function getPrettierConfig(eslintConfig) {
  switch (eslintConfig) {
    case 'airbnb':
      return {
        arrowParens: 'always',
        bracketSpacing: false,
        quoteProps: 'as-needed',
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'all',
        useTabs: false
      };

    case 'google':
      return {
        arrowParens: 'always',
        bracketSpacing: false,
        quoteProps: 'consistent',
        semi: false,
        singleQuote: true,
        tabWidth: 2,
        useTabs: false
      };

    case 'idiomatic':
      return {
        arrowParens: 'always',
        bracketSpacing: true,
        singleQuote: true,
        tabWidth: 2,
        useTabs: false
      };

    case 'standard':
      return {
        bracketSpacing: false,
        semi: false,
        singleQuote: true,
        tabWidth: 2,
        useTabs: false
      };

    case 'semi':
      return {
        bracketSpacing: false,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        useTabs: false
      };

    case 'xo':
      return {
        arrowParens: 'as-needed',
        bracketSpacing: false,
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        useTabs: true
      };
  }
}

function getLintStaged(props) {
  const lintStagedTasks = {
    "*.json": "jsonlint --quiet",
    "*.{ts,md,yml}": "prettierx --write"
  };

  if (props.features.includes('code')) {
    let languageExt;

    switch (props.language) {
      case 'coffeescript':
        languageExt = 'coffee';
        break;

      case 'javascript':
        languageExt = 'js';
        break;

      case 'typescript':
        languageExt = 'ts';
        break;

      default:
        break;
    }

    lintStagedTasks[`*.${languageExt}`] = (props.language === 'coffeescript'
      ? 'coffeelint ./src'
      : 'eslint --cache --fix'
    );
  }

  if (props.features.includes('styles')) {
    lintStagedTasks['*.(c|le)ss'] = 'stylelint --fix';
  }

  return lintStagedTasks;
}

module.exports = {
  composeBabel,
  composeManifest,
  getDependencies,
  getDestinationPath,
  getLicenses,
  getPrettierConfig,
  getTemplatePath
};
