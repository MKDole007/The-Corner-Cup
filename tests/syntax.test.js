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

test('server exposes a reusable app factory for tests and runtime startup', async () => {
    const serverModule = require(path.join(projectRoot, 'server.js'))

    assert.equal(typeof serverModule.createApp, 'function')
    assert.equal(typeof serverModule.startServer, 'function')
    assert.equal(typeof serverModule.app.use, 'function')
})
