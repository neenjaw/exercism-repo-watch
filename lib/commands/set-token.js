const keytar = require('keytar')

exports.command = 'set-token <token>'
exports.desc = 'Set your secret GitHub personal access token'
exports.builder = {
  token: {
    type: 'string',
  },
}
exports.handler = async function (argv) {
  const { token } = argv
  await keytar.setPassword('exercism-watch', 'github-pat', token)
  console.log('Successfully set token')
}
