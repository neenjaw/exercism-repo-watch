const keytar = require('keytar')

exports.command = 'get-token'
exports.desc = 'Get your secret GitHub personal access token'
exports.builder = {}
exports.handler = async function () {
  console.log(await keytar.getPassword('exercism-watch', 'github-pat'))
}
