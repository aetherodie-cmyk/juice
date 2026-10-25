const base=require('./playwright.config.cjs');
module.exports={...base,outputDir:'test-results/regression',use:{...base.use,baseURL:'http://127.0.0.1:4205'},webServer:{command:'python3 -m http.server 4205 --bind 127.0.0.1',url:'http://127.0.0.1:4205',reuseExistingServer:false}};
