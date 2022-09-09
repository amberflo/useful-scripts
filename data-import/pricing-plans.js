'use strict';

const fs = require('fs');
const csv = require('csv/sync');
const {
    CustomerDetailsClient,
    CustomerProductPlanClient,
    CustomerProductPlanApiPayload,
} = require('amberflo-metering-typescript');

const apiKey = null;

const customerApi = new CustomerDetailsClient(apiKey, false);
const pricingPlanApi = customerApi;
const customerProductPlanClient = new CustomerProductPlanClient(apiKey, false);

const csvData = fs.readFileSync('./pricing-plans.csv');
const data = csv.parse(csvData, { columns: true });

const startTimeInSeconds = Math.round(new Date('2022-08-01T00:00:00Z').getTime() / 1000);

const pricingPlanIdMap = {
    'v1': 'b7734529-3bd0-4a56-9a40-50ee84f92be7',
    'v2': '554ab269-48b2-4258-b1bc-270298dcc333',
};

function makeCustomerPricingPlan(record, customers, pricingPlans) {
    const customer = customers[record['account_id']];
    if (!customer) {
        throw new Error(`Customer not found: ${record['account_id']}`);
    }

    const pricingPlan = pricingPlans[pricingPlanIdMap[record['pricing_plan']]];
    if (!pricingPlan) {
        throw new Error(`Customer not found: ${record['pricing_plan']}`);
    }

    const payload = new CustomerProductPlanApiPayload(
        customer.id,
        pricingPlan.id,
    );
    payload.startTimeInSeconds = startTimeInSeconds;

    return payload;
}

async function createOrUpdate(payload) {
    const currentPricingPlan = await customerProductPlanClient.get(payload.customerId);
    if (currentPricingPlan) {
        if (currentPricingPlan.productPlanId !== payload.productPlanId) {
            console.log('ERROR: different pricing plan', currentPricingPlan);
        } else {
            console.log('INFO: already assigned', payload);
        }
        return;
    }

    const result = await customerProductPlanClient.addOrUpdate(payload);
    console.log('ASSIGNED:', result);
}

async function main() {
    const customers = (await customerApi.list()).reduce((acc, c) => { acc[c.id] = c; return acc }, {});
    //console.log(customers);

    const pricingPlans = (await pricingPlanApi.doGet('/payments/pricing/amberflo/account-pricing/product-plans/list'))
        .reduce((acc, c) => { acc[c.id] = c; return acc }, {});
    //console.log(pricingPlans);

    const customerPricingPlans = data.map(x => makeCustomerPricingPlan(x, customers, pricingPlans));
    //console.log(customerPricingPlans);

    for (const cpp of customerPricingPlans) {
        await createOrUpdate(cpp);
    }
    //await Promise.allSettled(customerPricingPlans.map(createOrUpdate));
}

main();
