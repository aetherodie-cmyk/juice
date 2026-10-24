const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: 'flow-reader.spec.cjs', timeout: 20000,
  fullyParallel: true, outputDir: 'test-results/reader-cross-browser',
  use: {baseURL:'http://127.0.0.1:4191',headless:true,viewport:{width:1440,height:900}},
  projects: [
    {name:'chrome',use:{browserName:'chromium',channel:'chrome'}},
    {name:'webkit',use:{browserName:'webkit'}}
  ],
  webServer: {command:'python3 -m http.server 4191 --bind 127.0.0.1',url:'http://127.0.0.1:4191',reuseExistingServer:!process.env.CI}
});
