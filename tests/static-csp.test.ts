import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditHtml} from '../scripts/check-static-csp.mjs';
test('built HTML audit rejects inline scripts, handlers and executable links',()=>{
 assert.deepEqual(auditHtml('<script type="module">alert(1)</script>'),['script without src']);
 assert.deepEqual(auditHtml('<button onclick="go()">Go</button>'),['inline event handler on button']);
 assert.deepEqual(auditHtml('<a href="javascript:go()">Go</a>'),['javascript URL on a']);
 assert.deepEqual(auditHtml('<script src="https://example.com/a.js"></script>'),['script src must be a same-site path']);
});
test('built HTML audit permits external modules and CSP-approved inline styles',()=>{
 assert.deepEqual(auditHtml('<script type="module" src="/_astro/privacy.abc.js"></script><p style="margin:0">Private</p>'),[]);
});
