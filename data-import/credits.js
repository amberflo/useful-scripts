'use strict';

const fs = require('fs');
const csv = require('csv/sync');
const uuid = require('uuid');

const {
    CustomerPrepaidOrderClient,
} = require('amberflo-metering-typescript');

const apiKey = null;

const api = new CustomerPrepaidOrderClient(apiKey, false);

const csvData = fs.readFileSync('./credits.csv');
const data = csv.parse(csvData, { columns: true }).map(x => ({
    customerId: x.account_id,
    prepaidPrice: parseFloat(x.credit),
}));

const productId = '1';
const label = 'Migration to Amberflo';
const nowInSeconds = Math.ceil(Date.now() / 1000);

async function create({ customerId, prepaidPrice }) {
    try {
        const existingOrders = await api.doGet('/payments/pricing/amberflo/customer-prepaid/list', { CustomerId: customerId, ProductId: productId });

        let prepaidOrder = existingOrders.filter(x => x.label === label)[0];

        if (!prepaidOrder) {
            const id = uuid.v4();

            const orderPayload = {
                id,
                label,
                customerId,
                startTimeInSeconds: nowInSeconds,
                prepaidPrice,
                externalPayment: true,
                productId,
                prepaidOfferVersion: -1,
            };

            prepaidOrder = await api.doPost('/payments/pricing/amberflo/customer-prepaid', orderPayload);

            console.log('CREATED:', { customerId, prepaidPrice });
        } else {
            console.log('ALREADY CREATED:', { customerId, prepaidPrice });
        }

        if (prepaidOrder.paymentStatus === 'requires_action') {
            const paymentId = uuid.v4();

            const settlePayload = {
                prepaidUri: prepaidOrder.firstInvoiceUri,
                paymentId,
                paymentStatus: 'settled',
                systemName: 'external_one_time',
            };

            await api.doPost('/payments/external/prepaid-payment-status', settlePayload);
            console.log('SETTLED:', { customerId });
        } else {
            console.log('ALREADY SETTLED:', { customerId, });
        }

    } catch (error) {
        console.error('FAILED:', error.message);
    }
}

async function main() {
    for (const credit of data) {
        await create(credit);
    }
    //await Promise.allSettled(customerPromotions.map(createOrUpdate));
}

main();
