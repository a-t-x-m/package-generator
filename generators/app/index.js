const Generator = require('yeoman-generator');
const meta = require('../../package.json');

const { join, sep } = require('path');
const { pascalCase } = require('pascal-case');
const ejs = require('ejs');
const fs = require('fs');
const prettier = require("prettier");
const slugify = require('@sindresorhus/slugify');
const spdxLicenseList = require('spdx-license-list/full');
const terminalLink = require('terminal-link');
const updateNotifier = require('update-notifier');
const yosay = require('yosay');

const {
  composeBabel,
  composeManifest,
  getLicenses,
  getDependencies,
  getDestinationPath,
  getPrettierConfig,
  getTemplatePath
} = require('../../lib/helpers');

const validators = require('../../lib/validators');

// Is there a newer version of this generator?
updateNotifier({ pkg: meta }).notify();

async function copyPrettyTpl(inputFile, outputFile, props) {
  const template = (
    await fs.promises.readFile(inputFile)
  ).toString();

  const unformatted = ejs.render(template, {pkg: props});
  const formatted = prettier.format(unformatted, {
    parser: 'babel',
    ...getPrettierConfig(props.eslintConfig)
  });

  await fs.promises.writeFile(outputFile, formatted, 'utf8');
}

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Use long flags to discourage usage
    this.option(
      'allow-atom-prefix',
      {
        desc: `Allows naming the package with "atom-" prefix`,
        default: true,
        type: Boolean
      }
    );

    this.option(
      'ignore-scope-warning',
      {
        desc: `Ignores scope warning`,
        default: true,
        type: Boolean
      }
    );

    this.option(
      'allow-empty-description',
      {
        desc: `Allows empty package description`,
        default: false,
        type: Boolean
      }
    );

    this.option(
      'clear',
      {
        desc: `Doesn't clear the console on startup`,
        default: true,
        type: Boolean
      }
    );

    this.option(
      'debug',
      {
        desc: `Displays debug information`,
        default: false,
        type: Boolean
      }
    );
  }

  linkify(label, url) {
    return terminalLink(label, url, {
      fallback() {
        return label;
      }
    })
  }

  async inquirer() {
    if (this.options.clear) console.clear();
    console.log(yosay('Let\'s go & build a package for Atom!'));

    return this.prompt([
      {
        name: 'name',
        message: 'What do you want to name your package?',
        default: slugify(this.appname),
        store: true,
        validate: str => validators.name(str, this.options)
      },
      {
        name: 'description',
        message: 'What is your package description?',
        default: '',
        store: true,
        validate: str => validators.description(str, this.options)
      },
      {
        name: 'author',
        message: 'What\'s your GitHub username?',
        default: async () => {
          let username;

          try {
            username = await this.user.github.username();
          } catch (error) {
            username = '';
          }

          return username;
        },
        store: true,
        validate: str => validators.user(str),
        when: () => !this.options.org
      },
      {
        type: 'confirm',
        name: 'private',
        message: 'Is this a private package?',
        store: true,
        default: false,
      },
      {
        type: 'list',
        name: 'license',
        message: 'Choose a license',
        default: 'MIT',
        store: true,
        choices: getLicenses,
      },

      {
        type: 'checkbox',
        name: 'features',
        message: 'Package Features',
        store: true,
        choices: [
          {
            name: 'Code',
            value: 'code',
            checked: true
          },
          {
            name: 'Grammars',
            value: 'grammars',
            checked: false
          },
          {
            name: 'Keymaps',
            value: 'keymaps',
            checked: false
          },
          {
            name: 'Menus',
            value: 'menus',
            checked: false
          },
          {
            name: 'Snippets',
            value: 'snippets',
            checked: false
          },
          {
            name: 'Styles',
            value: 'styles',
            checked: false
          }
        ]
      },
      {
        type: 'list',
        name: 'language',
        message: 'Choose your preferred language',
        default: 'typescript',
        store: true,
        choices: [
          {
            name: this.linkify('CoffeeScript', 'https://coffeescript.org'),
            value: 'coffeescript'
          },
          {
            name: this.linkify('JavaScript', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'),
            value: 'javascript'
          },
          {
            name: this.linkify('TypeScript', 'https://www.typescriptlang.org'),
            value: 'typescript'
          }
        ],
        when: answers => answers.features?.includes('code')
      },
      {
        type: 'list',
        name: 'bundler',
        message: 'Bundler',
        default: 'rollup',
        store: true,
        choices: [
          {
            name: this.linkify('Rollup', 'https://rollupjs.org/'),
            value: 'rollup'
          },
          {
            name: this.linkify('Webpack', 'https://webpack.js.org/'),
            value: 'webpack'
          }
        ],
        when: answers => answers.features?.includes('code')
      },
      {
        type: 'list',
        name: 'packageManager',
        message: 'Package Manager',
        default: 'npm',
        store: true,
        choices: [
          {
            name: this.linkify('npm', 'https://www.npmjs.com/get-npm'),
            value: 'npm'
          },
          {
            name: this.linkify('Yarn', 'https://yarnpkg.com/'),
            value: 'yarn'
          }
        ],
        when: answers => answers.features?.includes('code')
      },
      {
        type: 'confirm',
        name: 'activationCommands',
        message: 'Add activation command?',
        default: true,
        when: answers => answers.features?.includes('code')
      },
      {
        type: 'checkbox',
        name: 'activationHooks',
        message: 'Add activation hooks?',
        store: true,
        choices: [
          {
            name: 'Loaded Shell Environment',
            value: 'core:loaded-shell-environment',
            checked: false
          },
          {
            name: 'Root Scope Used',
            value: 'root-scope-used',
            checked: false
          },
          {
            name: 'Grammar Used',
            value: 'grammar-used',
            checked: false
          }
        ],
        when: answers => answers.features?.includes('code')
      },
      {
        name: 'rootScopeUsed',
        message: 'Activation Hooks: Specify root scope used',
        store: true,
        when: answers => answers.features?.includes('code') && answers.activationHooks?.includes('root-scope-used'),
        validate: str => validators.rootScope(str)
      },
      {
        name: 'grammarUsed',
        message: 'Activation Hooks: Specify grammar used',
        store: true,
        when: answers => answers.features?.includes('code') && answers.activationHooks?.includes('grammar-used'),
        validate: str => validators.grammar(str)
      },
      {
        type: 'confirm',
        name: 'workspaceOpeners',
        message: 'Add workspace openers?',
        store: true,
        default: false,
        when: answers => answers.features?.includes('code')
      },
      {
        name: 'workspaceOpenerURIs',
        message: 'Workspace Openers: Specify workspace URIs (comma-separated)',
        store: true,
        when: answers => answers.workspaceOpeners,
        validate: str => validators.workspaceOpener(str)
      },
      {
        type: 'confirm',
        name: 'atomDependenciesQuestion',
        message: 'Depend on other Atom packages?',
        default: false,
        store: true,
        // when: answers => answers.features?.includes('code')
      },
      {
        name: 'atomDependencies',
        message: 'Specify Atom packages (comma-separated)',
        store: true,
        when: answers => answers.atomDependenciesQuestion,
        validate: async str => await validators.atomDependencies(str)
      },
      {
        type: 'checkbox',
        name: 'additionalDependencies',
        message: 'Specify additional dependencies',
        store: true,
        choices: [
          {
            name: this.linkify('Developer Console', 'https://www.npmjs.com/package/@atxm/developer-console'),
            value: '@atxm/developer-console',
            checked: false
          },
          {
            name: this.linkify('Metrics', 'https://www.npmjs.com/package/@atxm/metrics'),
            value: '@atxm/metrics',
            checked: false
          }
        ],
        when: answers => answers.features?.includes('code') && answers.language !== 'coffeescript'
      },
      {
        name: 'gaTrackingId',
        message: 'Specify your Google Analytics Tracking ID',
        store: true,
        when: answers => answers.features?.includes('code') && answers.additionalDependencies?.includes('@atxm/metrics'),
        validate: trackingID => /^UA-\d{4,}-\d{1,}/.test(trackingID)
          ? true
          : 'Unsupported tracking ID format (should be UA-XXXX-Y)'
      },
      {
        type: 'checkbox',
        name: 'addConfig',
        message: 'Add CI configuration',
        store: true,
        choices: [
          {
            name: this.linkify('Bitbucket Pipelines', 'https://bitbucket.org/product/features/pipelines'),
            value: 'bitbucketPipelines',
            checked: false,
            disabled: answers => !answers.privatePackage
          },
          {
            name: this.linkify('Circle CI', 'https://circleci.com'),
            value: 'circleCI',
            checked: false
          },
          {
            name: this.linkify('GitHub Actions', 'https://github.com/features/actions'),
            value: 'githubActions',
            checked: false
          },
          {
            name: this.linkify('Travis CI', 'https://travis-ci.org'),
            value: 'travisCI',
            checked: false
          }
        ]
      },
      {
        type: 'checkbox',
        name: 'babelPresets',
        message: 'Babel Presets',
        store: true,
        when: answers => answers.features?.includes('code') && answers.language === 'javascript',
        choices: [
          {
            name: this.linkify('Flow', 'https://www.npmjs.com/package/@babel/preset-flow'),
            value: '@babel/preset-flow'
          },
          {
            name: this.linkify('React', 'https://www.npmjs.com/package/@babel/preset-react'),
            value: '@babel/preset-react',
          }
        ]
      },
      {
        type: 'list',
        name: 'eslintConfig',
        message: 'ESLint Configuration',
        default: 'eslint',
        store: true,
        when: answers => answers.features?.includes('code') && answers.language !== 'coffeescript',
        choices: [
          {
            name: this.linkify('Atom IDE Community', 'https://www.npmjs.com/package/eslint-config-atomic'),
            value: 'atomic',
          },
          {
            name: this.linkify('Airbnb', 'https://www.npmjs.com/package/eslint-config-airbnb'),
            value: 'airbnb',
          },
          {
            name: this.linkify('ESLint', 'https://www.npmjs.com/package/eslint-config-eslint'),
            value: 'eslint',
          },
          {
            name: this.linkify('Google', 'https://www.npmjs.com/package/eslint-config-google'),
            value: 'google',
          },
          {
            name: this.linkify('Idiomatic', 'https://www.npmjs.com/package/eslint-config-idiomatic'),
            value: 'idiomatic',
          },
          {
            name: this.linkify('Prettier', 'https://www.npmjs.com/package/eslint-config-prettier'),
            value: 'prettier',
          },
          {
            name: this.linkify('Semistandard', 'https://www.npmjs.com/package/eslint-config-semistandard'),
            value: 'semistandard',
          },
          {
            name: this.linkify('Standard', 'https://www.npmjs.com/package/eslint-config-standard'),
            value: 'standard',
          },
          {
            name: this.linkify('XO', 'https://www.npmjs.com/package/eslint-config-xo'),
            value: 'xo',
          }
        ]
      },
      {
        type: 'list',
        name: 'stylelintConfig',
        message: 'Stylelint Configuration',
        default: 'recommended',
        store: true,
        when: answers => answers.features?.includes('styles'),
        choices: [
          {
            name: this.linkify('Airbnb', 'https://www.npmjs.com/package/stylelint-config-airbnb'),
            value: 'airbnb',
          },
          {
            name: this.linkify('Idiomatic', 'https://www.npmjs.com/package/stylelint-config-idiomatic'),
            value: 'idiomatic',
          },
          {
            name: this.linkify('Prettier', 'https://www.npmjs.com/package/stylelint-config-prettier'),
            value: 'prettier',
          },
          {
            name: this.linkify('Primer', 'https://www.npmjs.com/package/stylelint-config-primer'),
            value: 'primer',
          },
          {
            name: this.linkify('Recommended', 'https://www.npmjs.com/package/stylelint-config-recommended'),
            value: 'recommended',
          },
          {
            name: this.linkify('Standard', 'https://www.npmjs.com/package/stylelint-config-standard'),
            value: 'standard',
          },
          {
            name: this.linkify('WordPress', 'https://www.npmjs.com/package/stylelint-config-wordpress'),
            value: 'wordpress',
          },
          {
            name: this.linkify('XO', 'https://www.npmjs.com/package/stylelint-config-xo'),
            value: 'xo',
          }
        ]
      },
      {
        type: 'confirm',
        name: 'vscodeTasks',
        message: 'Create Visual Studio Code tasks?',
        when: () =>  process.env.EDITOR?.includes(`${sep}code`) || process.env.VISUAL?.includes(`${sep}code`)
          ? true
          : false
      },
      {
        type: 'confirm',
        name: 'initGit',
        message: 'Initialize Git repository?',
        default: this.fs.exists(join(process.cwd(), '.git', 'config'))
          ? false
          : true
      },
      {
        type: 'confirm',
        name: 'linkDevPackage',
        message: 'Link as developer package?',
        default: true,
        store: true
      },
      {
        type: 'confirm',
        name: 'openInEditor',
        message: 'Open in default editor?',
        default: true,
        store: true,
        when: () => process.env.EDITOR
          ? true
          : false
      },
    ]).then(async props => {
      if (this.options.debug) console.log(props);

      props.className = pascalCase(props.name.replace('-', ' '));
      props.licenseURL = spdxLicenseList[props.license].url;
      props.licenseName = spdxLicenseList[props.license].name;
      props.licenseText = spdxLicenseList[props.license].licenseText.replace(/\n{3,}/g, '\n\n');
      props.repositoryName = (props.name.startsWith('atom-'))
        ? props.name
        : `atom-${props.name}`;
      props.lintScript = (props.features?.includes('styles'))
        ? "npm run lint:code && npm run lint:styles"
        : "npm run lint:code";

      if (typeof props.atomDependencies !== 'undefined') {
        props.atomDependencies = props.atomDependencies.split(',');
        props.atomDependencies.map(dependency => dependency.trim());
      }

      // Copying files
      await Promise.all(props.features.map( async feature => {
        if (feature !== 'code') await fs.promises.mkdir(feature, {recursive: true});
      }));

      if (props.language === 'coffeescript') {
        if (props.features?.includes('code') && props.features?.includes('keymaps')) {
          this.fs.copyTpl(
            this.templatePath('coffeescript/keymaps/keymap.cson.ejs'),
            this.destinationPath(`keymaps/${props.name}.cson`),
            {
              pkg: props
            }
          );
        }

        if (props.features?.includes('code') && props.features?.includes('menus')) {
          this.fs.copyTpl(
            this.templatePath('coffeescript/menus/menu.cson.ejs'),
            this.destinationPath(`menus/${props.name}.cson`),
            {
              pkg: props
            }
          );
        }
      } else {
        if (props.features?.includes('code') && props.features?.includes('keymaps')) {
          this.fs.copyTpl(
            this.templatePath('shared/keymaps/keymap.json.ejs'),
            this.destinationPath(`keymaps/${props.name}.json`),
            {
              pkg: props
            }
          );
        }

        if (props.features?.includes('code') && props.features?.includes('menus')) {
          this.fs.copyTpl(
            this.templatePath('shared/menus/menu.json.ejs'),
            this.destinationPath(`menus/${props.name}.json`),
            {
              pkg: props
            }
          );
        }
      }

      if (props.features?.includes('styles')) {
        this.fs.copyTpl(
          this.templatePath('shared/styles/style.less.ejs'),
          this.destinationPath(`styles/${props.name}.less`),
          {
            pkg: props
          }
        );
      }

      if (props.features?.includes('code') && props.additionalDependencies?.includes('@atxm/metrics')) {
        props.metricsContructor = props.language === 'coffeescript'
          ? `# Initialize Metrics\n    Metrics.init "${props.gaTrackingId}"`
          : `
            // Initialize Metrics
            Metrics.init(${props.gaTrackingId});
          `;
      }

      fs.promises.mkdir('src', {recursive: true});

      if (props.features?.includes('code')) {
        if (props.language === 'coffeescript') {
          this.fs.copyTpl(
            this.templatePath('coffeescript/src/main.ejs'),
            this.destinationPath(`src/main.coffee`),
            {
              pkg: props
            }
          );
        } else {
          await copyPrettyTpl(
            this.templatePath(await getTemplatePath(`src/main.ejs`, props.language)),
            this.destinationPath(getDestinationPath(`src/main.ejs`, props.language)),
            props
          );
        }

        this.fs.copyTpl(
          this.templatePath(await getTemplatePath('src/config.ejs', props.language)),
          this.destinationPath(getDestinationPath('src/config.ejs', props.language)),
          {
            pkg: props
          }
        );

        this.fs.copyTpl(
          this.templatePath(await getTemplatePath('src/hello-world.ejs', props.language)),
          this.destinationPath(getDestinationPath('src/hello-world.ejs', props.language)),
          {
            pkg: props
          }
        );
      }

     this.fs.copyTpl(
        this.templatePath('shared/README.md.ejs'),
        this.destinationPath('README.md'),
        {
          pkg: props
        }
      );

      this.fs.copyTpl(
        this.templatePath('shared/LICENSE.ejs'),
        this.destinationPath('LICENSE'),
        {
          licenseText: props.licenseText
        }
      );

      if (props.features?.includes('code')) {
        const bundlerConfig = props.bundler === 'rollup'
          ? 'rollup.config.js'
          : 'webpack.config.js';

        this.fs.copy(
          this.templatePath(await getTemplatePath(`${bundlerConfig}.ejs`, props.language)),
          this.destinationPath(bundlerConfig)
        );
      }

      if (props.addConfig?.includes('bitbucketPipelines')) {
        this.fs.copy(
          this.templatePath('shared/ci/bitbucket-pipelines.yml'),
          this.destinationPath('bitbucket-pipelines.yml')
        );
      }

      if (props.addConfig?.includes('circleCI')) {
        await fs.promises.mkdir('.circleci', {recursive: true});

        this.fs.copyTpl(
          this.templatePath('shared/ci/circleci.yml'),
          this.destinationPath('.circleci/config.yml')
        );
      }

      if (props.addConfig?.includes('githubActions')) {
        await fs.promises.mkdir('.github/workflows', {recursive: true});

        this.fs.copyTpl(
          this.templatePath('shared/ci/github-actions.yml'),
          this.destinationPath('.github/workflows/nodejs.yml')
        );
      }

      if (props.addConfig?.includes('travisCI')) {
        this.fs.copy(
          this.templatePath('shared/ci/travis.yml'),
          this.destinationPath('.travis.yml')
        );
      }

      this.fs.copy(
        this.templatePath('shared/_editorconfig'),
        this.destinationPath('.editorconfig')
      );

      this.fs.copyTpl(
        this.templatePath('shared/_gitignore'),
        this.destinationPath('.gitignore'),
        {
          foreignLockfile: props.packageManager === 'yarn'
            ? 'package-lock-json'
            : 'yarn.lock'
        }
      );

      this.fs.copyTpl(
        this.templatePath('shared/_gitattributes'),
        this.destinationPath('.gitattributes'),
        {
          foreign: props
        }
      );

      if (props.features?.includes('styles')) {
        this.fs.copyTpl(
          this.templatePath('shared/_stylelintrc.ejs'),
          this.destinationPath('.stylelintrc'),
          {
            pkg: props
          }
        );
      }

      if (props.features?.includes('code')) {

        switch (props.language) {
          case 'coffeescript':
            this.fs.copy(
              this.templatePath('coffeescript/_coffeelintignore'),
              this.destinationPath('.coffeelintignore')
            );

            this.fs.copy(
              this.templatePath('coffeescript/coffeelint.json'),
              this.destinationPath('coffeelint.json')
            );
            break;

          case 'javascript':
            this.fs.copyTpl(
              this.templatePath('javascript/_eslintrc.ejs'),
              this.destinationPath('.eslintrc.cjs'),
              {
                pkg: props
              }
            );
            break;

          case 'typescript':
            this.fs.copyTpl(
              this.templatePath('typescript/_eslintrc.ejs'),
              this.destinationPath('.eslintrc.cjs'),
              {
                pkg: props
              }
            );

            if (props.bundler === 'webpack') {
              this.fs.copy(
                this.templatePath('typescript/tsconfig.json'),
                this.destinationPath('tsconfig.json')
              );
            }
            break;
        }
      }

      if (['javascript', 'typescript'].includes(props.language)) {
        this.fs.copyTpl(
          this.templatePath(`${props.language}/_babelrc.ejs`),
          this.destinationPath('.babelrc'),
          {
            babelrc: composeBabel(props),
            indentation: 2
          }
        );
      }

      // switch (props.eslintConfig) {
      //   case 'eslint':
      //     props.indent_style = 'space';
      //     props.indent_size = 4;
      //     props.ws = '    ';
      //     break;
      //   case 'wordpress':
      //   case 'xo':
      //     props.indent_style = 'tab';
      //     props.ws = '\t';
      //     break;
      //   default:
      //     props.indent_style = 'space';
      //     props.indent_size = 2;
      //     props.ws = '  ';
      //     break;
      // }

      this.fs.copy(
        this.templatePath('shared/_husky'),
        this.destinationPath('.husky/pre-commit')
      );

      if (props.vscodeTasks) {
        this.fs.copy(
          this.templatePath('shared/vscode/tasks.json'),
          this.destinationPath('.vscode/tasks.json')
        );
      }

      // Install dependencies
      this.fs.copyTpl(
        this.templatePath('shared/package.json.ejs'),
        this.destinationPath(`package.json`),
        {
          manifest: composeManifest(props),
          indentation: 2
        }
      );

      const [dependencies, devDependencies] = getDependencies(props);
      const installApi = `${props.packageManager}Install`;

      if (props.features?.includes('code')) {
        if (dependencies.length) this[installApi](dependencies, { ignoreScripts: true });
      }

      if (devDependencies.length) this[installApi](devDependencies, { 'dev': true });

      // Initialize git repository
      if (props.initGit) {
        this.spawnCommandSync('git', ['init']);
      }

      // Link to ~/.atom/dev/packages
      if (props.linkDevPackage === true) {
        this.spawnCommand('apm', ['link', '--dev']);
      }

      // Open in Editor
      if (props.openInEditor === true) {
        this.spawnCommand(process.env.EDITOR, [ '.' ]);
      }
    });
  }
};
