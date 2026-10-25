const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',testMatch:'workspace.spec.cjs',timeout:20000,fullyParallel:true,
  outputDir:'test-results/workspace',use:{baseURL:'http://127.0.0.1:4198',headless:true,acceptDownloads:true},
  webServer:{command:'python3 -m http.server 4198 --bind 127.0.0.1',url:'http://127.0.0.1:4198',reuseExistingServer:false}
});
