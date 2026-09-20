const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const test = require('node:test')
const path = require('node:path')

const projectRoot = path.join(__dirname, '..')

for (const file of ['app.js', 'server.js']) {
    test(`${file} has valid JavaScript syntax`, () => {
        assert.doesNotThrow(() => {
            execFileSync(process.execPath, ['--check', path.join(projectRoot, file)], { stdio: 'pipe' })
        })
    })
}
