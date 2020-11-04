const { getSecretToken } = require('../secrets')
const { Octokit } = require('@octokit/rest')
const chalk = require('chalk')
const CLI = require('clui')
const Spinner = CLI.Spinner
const inquirer = require('inquirer')

const spinnerLook = ['⣾', '⣷', '⣯', '⣟', '⡿', '⢿', '⣻', '⣽']

exports.command = '$0'
exports.desc = 'look up the org subscriptions'
exports.builder = {}
exports.handler = async function (argv) {
  const token = await getSecretToken()
  const octokit = new Octokit({ auth: token })

  const loadStatus = new Spinner('Finding Exercism repositories..', spinnerLook)
  loadStatus.start()
  const orgRepos = await getOrgRepositories(octokit)
  console.log(' Found!')
  loadStatus.message('Finding your watched repositories..')
  const userSubscriptions = await getWatchedRepositories(octokit)
  console.log(' Found!')
  loadStatus.stop()

  const userSubscriptionsSet = new Set(userSubscriptions)
  const orgReposWatched = addWatchedStatus(orgRepos, userSubscriptionsSet)
  const reposToWatchAnswer = await inquirer.prompt(
    repoSelectQuestion(orgRepos, orgReposWatched)
  )
  const toWatchSet = new Set(reposToWatchAnswer.wantToWatch)

  const subscriptionsToAdd = reposToWatchAnswer.wantToWatch.filter(
    (repo) => !userSubscriptionsSet.has(repo)
  )
  const subscriptionsToRemove = orgReposWatched
    .filter(({ repo, isWatched }) =>
      isWatched ? !toWatchSet.has(repo) : false
    )
    .map(({ repo, _ }) => repo)

  const confirmAnswer = await inquirer.prompt(
    repoSubscriptionConfirm(subscriptionsToAdd, subscriptionsToRemove)
  )

  if (confirmAnswer.confirmAdd || confirmAnswer.confirmRemove) {
    const alterStatus = new Spinner(
      'Making requested changes to Exercism subscrptions...',
      spinnerLook
    )
    alterStatus.start()
    if (confirmAnswer.confirmAdd) {
      alterStatus.message('Adding subscriptions...')
      await addSubscriptions(octokit, subscriptionsToAdd)
      console.log(' Added!')
    }
    if (confirmAnswer.confirmRemove) {
      alterStatus.message('Removing subscriptions...')
      await removeSubscriptions(octokit, subscriptionsToRemove)
      console.log(' Removed!')
    }
    alterStatus.stop()
  }
}

function repoSelectQuestion(repos, reposWatched) {
  return [
    {
      type: 'checkbox',
      name: 'wantToWatch',
      message: 'Select the repositories that you wish to watch:',
      choices: repos,
      pageSize: 15,
      default: reposWatched
        .filter((repoEntry) => repoEntry.isWatched)
        .map((repoEntry) => repoEntry.repo),
    },
  ]
}

function repoSubscriptionConfirm(toAdd, toRemove) {
  return [
    {
      type: 'confirm',
      name: 'confirmAdd',
      message: `Confirm that you wish to ${chalk.green(
        'add'
      )} subscriptions to:\n${toAdd
        .map((repo) => chalk.green(`   + ${repo}`))
        .join('\n')}`,
      default: false,
      when: () => toAdd.length > 0,
    },
    {
      type: 'confirm',
      name: 'confirmRemove',
      message: `Confirm that you wish to ${chalk.red(
        'remove'
      )} subscriptions to:\n${toRemove
        .map((repo) => chalk.red(`   - ${repo}`))
        .join('\n')}`,
      default: false,
      when: () => toRemove.length > 0,
    },
  ]
}

function addWatchedStatus(repos, userSubscriptions) {
  return repos.map((repo) => {
    return {
      repo,
      isWatched: userSubscriptions.has(repo),
    }
  })
}

async function getOrgRepositories(octokit) {
  return await getRepositories(
    octokit,
    'GET /orgs/{org}/repos',
    {
      org: 'exercism',
      per_page: 100,
    },
    { filter: 'DEPRECATED' }
  )
}

async function getWatchedRepositories(octokit) {
  return await getRepositories(octokit, 'GET /user/subscriptions')
}

async function getRepositories(octokit, path, params, options = {}) {
  const repoResponses = await getAllPages(octokit, path, params)

  const repositoryNames = repoResponses
    .map((response) => response.data)
    .flat()
    .map((repository) => repository.full_name)
    .sort(alphabeticallyCaseInsensitive)

  if (options?.filter) {
    return repositoryNames.filter(
      (name) => !(name.indexOf(options.filter) !== -1)
    )
  }

  return repositoryNames
}

async function getAllPages(octokit, reqPath, reqParams = {}) {
  const pages = [await octokit.request(reqPath, reqParams)]

  const numberOfPages = getNumberOfPages(pages[0])

  for (let i = 2; i <= numberOfPages; i += 1) {
    reqParams.page = i
    pages.push(await octokit.request(reqPath, reqParams))
  }

  return pages
}

async function addSubscriptions(octokit, repos) {
  for (let index = 0; index < repos.length; index += 1) {
    const repo = repos[index]
    await addSubscription(octokit, repo)
  }
}

async function addSubscription(octokit, repo) {
  return await octokit.activity.setRepoSubscription({
    owner: 'exercism',
    repo: repo.substring(repo.indexOf('/') + 1),
    subscribed: true,
  })
}

async function removeSubscriptions(octokit, repos) {
  for (let index = 0; index < repos.length; index += 1) {
    const repo = repos[index]
    await removeSubscription(octokit, repo)
  }
}

async function removeSubscription(octokit, repo) {
  return await octokit.activity.deleteRepoSubscription({
    owner: 'exercism',
    repo: repo.substring(repo.indexOf('/') + 1),
  })
}

function tokenNotSet() {
  console.log('Unable to find github personal access token.')
  console.log(
    'Re-run command using `node cli.js set-token <token>` before querying'
  )

  process.exit(1)
}

function getNumberOfPages(response) {
  const {
    headers: { link: links },
  } = response
  const lastLink = links
    .split(', ')
    .map((links) => links.split('; '))
    .filter(([apiLink, rel]) => rel === 'rel="last"')[0]

  return Number(lastLink[0].match(/(&|\?)page=(\d+)/)[2])
}

function alphabeticallyCaseInsensitive(a, b) {
  return a.toLowerCase().localeCompare(b.toLowerCase())
}
