'use strict';

const fs = require('fs');
const csv = require('csv/sync');
const { CustomerDetailsClient, CustomerDetailsApiPayload } = require('amberflo-metering-typescript');

const apiKey = null;
const customerApi = new CustomerDetailsClient(apiKey, false);

const csvData = fs.readFileSync('./customers.csv');
const data = csv.parse(csvData, { columns: true });

function makeCustomer(record) {
    const traits = new Map();
    //traits.set('status', record['status']);

    return {
        customerId: record['customer id'],
        customerName: record['name'],
        traits,
    };
}

const customers = data.map(makeCustomer);

async function createOrUpdate(record) {
    const payload = new CustomerDetailsApiPayload(record.customerId, record.customerName, record.traits);
    const customer = await customerApi.update(payload);
    console.log(customer);
}

Promise.allSettled(customers.map(createOrUpdate));
