const keytar = require('keytar')

exports.command = 'remove-token'
exports.desc = 'Remove your secret GitHub personal access token'
exports.builder = {}
exports.handler = async function () {
  console.log(await keytar.deletePassword('exercism-watch', 'github-pat'))
}
