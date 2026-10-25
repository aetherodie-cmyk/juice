const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.cjs',timeout:20000,fullyParallel:true,
  outputDir:'test-results/workspace-regression',use:{baseURL:'http://127.0.0.1:4199',headless:true,acceptDownloads:true},
  webServer:{command:'python3 -m http.server 4199 --bind 127.0.0.1',url:'http://127.0.0.1:4199',reuseExistingServer:false}
});
