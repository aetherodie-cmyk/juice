const { defineConfig } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',timeout:20000,fullyParallel:true,
  use:{baseURL:'http://127.0.0.1:4187',headless:true,acceptDownloads:true},
  webServer:{command:'python3 -m http.server 4187 --bind 127.0.0.1',url:'http://127.0.0.1:4187',reuseExistingServer:!process.env.CI},
});
