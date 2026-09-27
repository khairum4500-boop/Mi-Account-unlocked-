const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-unlock-test-'));
process.env.DATABASE_FILE = path.join(tempDir, 'test.db');
delete process.env.DATABASE_URL;

const db = require('../database');

test('license lifecycle: approve -> block -> unblock is atomic and state-consistent', async () => {
    await db.initDb();

    const deviceId = 'MI-TEST-001';
    const pending = await db.registerApprovalRequest({
        deviceId,
        name: 'Test User',
        contactNumber: '01700000000',
        telegramUsername: '@test',
        whatsappNumber: '01700000000',
        appVersion: 1,
        deviceModel: 'Test Model',
        deviceBrand: 'Test Brand'
    });
    assert.equal(pending.status, 'PENDING');

    const approved = await db.approveDeviceDuration(deviceId, 3600, false, 'TEST_ADMIN');
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.durationSeconds, 3600);
    assert.ok(approved.activationTimestamp > 0);
    assert.ok(approved.expirationTimestamp > approved.activationTimestamp);

    const blocked = await db.blockDevice(deviceId, 'TEST_ADMIN');
    assert.equal(blocked.status, 'BLOCKED');
    assert.equal(blocked.activationTimestamp, approved.activationTimestamp);
    assert.equal(blocked.expirationTimestamp, approved.expirationTimestamp);

    await assert.rejects(
        () => db.registerApprovalRequest({
            deviceId,
            name: 'Test User 2',
            contactNumber: '01800000000',
            telegramUsername: '@test2',
            whatsappNumber: '01800000000',
            appVersion: 1,
            deviceModel: 'Test Model',
            deviceBrand: 'Test Brand'
        }),
        /blocked/i
    );

    const unblocked = await db.unblockDeviceDuration(deviceId, 7200, false, 'TEST_ADMIN');
    assert.equal(unblocked.status, 'APPROVED');
    assert.equal(unblocked.durationSeconds, 7200);
    assert.notEqual(unblocked.activationTimestamp, approved.activationTimestamp);
    assert.ok(unblocked.expirationTimestamp > unblocked.activationTimestamp);

    const lifetimeBlocked = await db.blockDevice(deviceId, 'TEST_ADMIN');
    assert.equal(lifetimeBlocked.status, 'BLOCKED');
    const lifetime = await db.unblockDeviceDuration(deviceId, 0, true, 'TEST_ADMIN');
    assert.equal(lifetime.status, 'APPROVED');
    assert.equal(lifetime.isLifetime, true);
    assert.equal(lifetime.expirationTimestamp, null);
});
