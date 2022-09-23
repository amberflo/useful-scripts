'use strict';

const fs = require('fs');
const csv = require('csv/sync');
const {
    CustomerDetailsClient,
} = require('amberflo-metering-typescript');

const apiKey = null;

const customerApi = new CustomerDetailsClient(apiKey, false);
const promotionsApi = customerApi;
const customerPromotionApi = customerApi;

const csvData = fs.readFileSync('./discounts.csv');
const data = csv.parse(csvData, { columns: true });

//const uniquePromos = data.map(x => {
//    const { account_id, valid_from, ...other } = x;
//    return JSON.stringify(other);
//}).reduce((a, x) => { a.add(x); return a }, new Set())
//console.log(Array.from(uniquePromos).sort());

const computePromos = {
    '10': 'b4b54af8-015b-4891-a57f-5ed1d1fbf0d5',
    '45': '20ec5bd8-8761-4244-a210-020142a1aa51',
    '50': '923bb52d-cc6b-4e1b-9f3e-edbfa64ec135',
};

function makeCustomerPromotion(record, customers, promotions) {
    const customer = customers[record['account_id']];
    if (!customer) {
        console.log(`ERROR: Customer not found: ${record['account_id']}`);
        return null;
    }

    let promotion;

    if (record['all costs percent'] === '100') {
        promotion = promotions['4a0af6c6-3e72-45cf-9578-7271b461795e'];

    } else if (record['compute percent'] !== '0') {
        promotion = promotions[computePromos[record['compute percent']]]
    }

    if (!promotion) {
        console.log('WARN: no promotion for', record);
        return null;
    }

    return {
        productId: '1',
        promotionId: promotion.id,
        customerId: customer.id,
    };
}

async function createOrUpdate(payload) {
    const currentPromotions = await customerPromotionApi.doGet(
        'https://app.amberflo.io/payments/pricing/amberflo/customer-promotions/list',
        { CustomerId: payload.customerId, ProductId: '1' },
    );

    if (currentPromotions && currentPromotions.length > 0) {
        if (currentPromotions.length > 1) {
            console.log('ERROR: multiple promotions', currentPromotions);
        } else if (currentPromotions[0].promotionId !== payload.promotionId) {
            console.log('ERROR: different promotion', currentPromotions);
        } else  {
            console.log('WARN: already assigned', payload);
        }
        return;
    }

    try {
        const result = await customerPromotionApi.doPost(
            'https://app.amberflo.io/payments/pricing/amberflo/customer-promotions',
            payload,
        );
        console.log('ASSIGNED:', result);
    } catch (error) {
        console.log('ERROR:', error.message, payload);
    }
}

async function main() {
    const customers = (await customerApi.list()).reduce((acc, c) => { acc[c.id] = c; return acc }, {});
    //console.log(customers);

    const promotions = (await promotionsApi.doGet('/payments/pricing/amberflo/account-pricing/promotions/list'))
        .reduce((acc, c) => { acc[c.id] = c; return acc }, {});
    //console.log(promotions);

    const customerPromotions = data.map(x => makeCustomerPromotion(x, customers, promotions)).filter(x => x);
    //console.log(customerPromotions);

    for (const cp of customerPromotions) {
        await createOrUpdate(cp);
    }
    //await Promise.allSettled(customerPromotions.map(createOrUpdate));
}

main();
