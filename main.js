var express = require('express');
var reveal = require('reveal-sdk-node');
var cors = require('cors');
const fs = require('fs');
const path = require('path');

//const pipelineAsync = promisify(pipeline);
const app = express();
app.use(cors()); 


// Step 0 - OPTIONAL Create API to Retrieve Dashboards
app.get('/dashboards/names', (req, res) => {
  const directoryPath = './dashboards';
  fs.readdir(directoryPath, (err, files) => {
    const fileNames = files.map((file) => {
    const { name } = path.parse(file);
    return { name };
    });
    res.send(fileNames);
  });
});

// Step 1: OPTIONAL Create a user context provider
// https://help.revealbi.io/web/user-context/
const userContextProvider = (request) => {
  const userId = request.headers['x-header-one']; 
  var props = new Map();
  props.set("userId", userId); 
  console.log("User ID: " + userId);  
  return new reveal.RVUserContext(userId, props);
};

// Step 2: REQUIRED Create an authentication provider with username / password to your SQL Server database
// https://help.revealbi.io/web/authentication/?code=node-ts
const authenticationProvider = async (userContext, dataSource) => {
  if (dataSource instanceof reveal.RVMySqlDataSource) {
    return new reveal.RVUsernamePasswordDataSourceCredential("demouser", "demopass"); }
}

// Step 3: Create a data source provider with the host, database, and schema
// https://help.revealbi.io/web/adding-data-sources/mysql/
const dataSourceProvider = async (userContext, dataSource) => {
  if (dataSource instanceof reveal.RVMySqlDataSource) {
    dataSource.host = "s0106docker2.infragistics.local";
    dataSource.database = "northwind";
    //dataSource.schema = "user";
  }
  return dataSource;
}


// Step 4: REQUIRED Create a data source item provider to handle curated data source items, 
// custom queries, functions, etc.
// https://help.revealbi.io/web/adding-data-sources/mysql/
// https://help.revealbi.io/web/custom-queries/
const dataSourceItemProvider = async (userContext, dataSourceItem) => {
  
  await dataSourceProvider(userContext, dataSourceItem.dataSource);

  if (dataSourceItem instanceof reveal.RVMySqlDataSourceItem) {
    // check the incoming .procedure name and set the procedureParameters 
    // based on the userContext parameter
    if (dataSourceItem?.procedure === "sp_customer_orders" || dataSourceItem?.id === "sp_customer_orders") {
        dataSourceItem.procedure = "sp_customer_orders";
        dataSourceItem.procedureParameters = {
          customer: userContext.userId
        };
      }

      // check the incoming .id name and set the customQuery 
      if (dataSourceItem.id === "customer_orders") {  
        dataSourceItem.customQuery = `SELECT 
              c.id, c.company, c.last_name, c.first_name, 
              c.email_address, c.job_title, c.business_phone, c.home_phone, 
              c.mobile_phone, c.fax_number, c.address, c.city, c.state_province, 
              c.zip_postal_code, c.country_region, c.web_page, c.notes, c.attachments,
              o.id AS order_id, o.employee_id, o.customer_id, o.order_date, 
              o.shipped_date, o.shipper_id, o.ship_name, o.ship_address, 
              o.ship_city
          FROM customers c
          JOIN orders o ON c.id = o.customer_id
          `
      }

      // check the incoming .id name and set the customQuery to the incoming ID
      if (dataSourceItem.id === "customer_orders_details") {  
        dataSourceItem.customQuery = `SELECT * from ${dataSourceItem.id}`;
      }

      // check the incoming .table name and set the customQuery 
      if (dataSourceItem.table === "customers") {
        console.log(`UserContextProvider: ${userContext?.userId ?? "Unknown User"}`);
        const customerId = userContext?.userId ?? ""; 
        dataSourceItem.customQuery = `SELECT * FROM ${dataSourceItem.table} WHERE id = '${customerId}'`;
      }
    }
    return dataSourceItem;
  }


// Step 5: OPTIONAL Create a data source item filter to restrict access to certain data source items
// https://github.com/RevealBi/Documentation/blob/master/docs/web/user-context.md
const dataSourceItemFilter = async (userContext, dataSourceItem) => {
  // As a test - ensure the function only runs if userId is 11  
  if (userContext.userId == "11") {
    if (dataSourceItem instanceof reveal.RVMySqlDataSourceItem) {
      // These are the only tables I want to show
      const allowedItems = ["customers", "orders", "order_details", "invoices"];
      // Remove the data source item if it is not in the allowedItems list with the ! operator
      if (
        (dataSourceItem.table && !allowedItems.includes(dataSourceItem.table)) ||
        (dataSourceItem.procedure && !allowedItems.includes(dataSourceItem.procedure))
      ) {
        return false;
      }
    }
}
  return true;
};

// Step 6: OPTIONAL Create a DashboardProvider to handle custom dashboard loading / saving
// Read / write dashboards to the file system, or optionally a database
// also userContext can be used to save / load dashboards based on any property in the userContext
// https://help.revealbi.io/web/saving-dashboards/#example-implementing-save-with-irvdashboardprovider
const dashboardProvider = async (userContext, dashboardId) => {
	return fs.createReadStream(`${dashboardDirectory}/${dashboardId}.rdash`);
}

const dashboardStorageProvider = async (userContext, dashboardId, stream) => {
	await pipelineAsync(stream, fs.createWriteStream(`${dashboardDirectory}/${dashboardId}.rdash`));
}

// Step 7: Create the reveal options with the user context provider, authentication provider, data source provider,
//  and data source item provider
const revealOptions = {
    userContextProvider: userContextProvider,
    authenticationProvider: authenticationProvider,
    dataSourceProvider: dataSourceProvider,
    dataSourceItemProvider: dataSourceItemProvider,
    // dataSourceItemFilter: dataSourceItemFilter,
    // dashboardProvider: dashboardProvider,
    // dashboardStorageProvider: dashboardStorageProvider,
}

app.use('/', reveal(revealOptions));

app.listen(5112, () => {
    console.log(`Reveal server accepting http requests`);
});