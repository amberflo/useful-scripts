'use strict';

const fs = require('fs');
const csv = require('csv/sync');
const limit = require('p-limit')(8);
const { CustomerDetailsClient } = require('amberflo-metering-typescript');

const apiKey = '';

const rawApi = new CustomerDetailsClient(apiKey, false);

const productId = '1';

const columns = {
    customers: [
        'customer_id',
        'customer_email',
        'promotion_id',
        'promotion_name',
        'promotion_applied_date',
        'current_invoice_start_date',
        'current_invoice_end_date',
        'current_invoice_pricing_plan_id',
        'current_invoice_payment_status',
        'current_invoice_price_status',
        'current_invoice_total_amount',
    ],
    invoices: [
        'customer_id',
        'start_date',
        'end_date',
        'pricing_plan_id',
        'payment_status',
        'price_status',
        'total_amount',
    ],
    promotions: [
        'customer_id',
        'id',
        'name',
        'applied_date',
    ],
};

async function main() {
    const data = {
        customers: [],
        invoices: [],
        promotions: [],
    };

    const customers = await cachedGet('/customers');  // if there are too many customers, we need to use the paging endpoint
    console.log('total customers:', customers.length);

    const promotionsMap = (await cachedGet('/payments/pricing/amberflo/account-pricing/promotions/list'))
        .reduce((acc, x) => { acc[x.id] = x; return acc; }, {});
    console.log('total promotions:', Object.keys(promotionsMap).length);

    //for (const c of customers) {
    //    await getCustomerData(c, data, promotionsMap);
    //}
    await Promise.all(customers.map(c => limit(() => getCustomerData(c, data, promotionsMap))));

    for (const [key, rows] of Object.entries(data)) {
        const csvString = csv.stringify(rows, { columns: columns[key], header: true });
        fs.writeFileSync(`./${key}.csv`, csvString, { flags: 'w' });
    }
}

main();

async function getCustomerData(c, data, promotionsMap) {
    console.log('customer:', c.customerId);

    const invoices = (await cachedGet(
        '/payments/billing/customer-product-invoice/all',
        { productId, customerId: c.customerId, fromCache: false, withPaymentStatus: true }
    ))
        .map(formatInvoice);
    console.log('  invoices:', invoices.length);

    const promotions = (await cachedGet('/payments/pricing/amberflo/customer-promotions/list', { CustomerId: c.customerId }))
        .map(x => formatPromotion(x, promotionsMap));
    console.log('  promotions:', promotions.length);

    const customer = {
        customer_id: c.customerId,
        customer_email: c.customerEmail,
        ...addKeyPrefix('promotion', promotions[0]),
        ...addKeyPrefix('current_invoice', invoices[0]),
    };

    delete customer.promotion_customer_id;  // remove duplicate columns
    delete customer.current_invoice_customer_id;

    data.customers.push(customer);
    data.invoices.push(...invoices);
    data.promotions.push(...promotions);
}

function formatInvoice(x) {
    return {
        customer_id: x.invoiceKey.customerId,
        start_date: iso(x.invoiceStartTimeInSeconds * 1000),
        end_date: iso(x.invoiceEndTimeInSeconds * 1000),
        pricing_plan_id: x.invoiceKey.productPlanId,
        payment_status: x.paymentStatus,
        price_status: x.invoicePriceStatus,
        total_amount: x.totalBill.totalPrice,
    };
}

function formatPromotion(x, promotionsMap) {
    return {
        customer_id: x.customerId,
        id: x.promotionId,
        name: promotionsMap[x.promotionId].promotionName,
        applied_date: iso(x.appliedTimeInSeconds * 1000),
    };
}

function iso(x) {
    return new Date(x).toISOString();
}

function addKeyPrefix(prefix, obj) {
    if (!obj) return {};
    return Object.entries(obj).reduce((acc, [k, v]) => { acc[`${prefix}_${k}`] = v; return acc; }, {});
}

async function cachedGet(path, params = {}) {
    const filePath = `./cache/${cacheKey(path, params)}.json`;

    let data;

    if (fs.existsSync(filePath)) {
        console.log('  cache hit:', filePath);
        data = JSON.parse(fs.readFileSync(filePath));
    } else {
        console.log('  cache miss:', filePath);
        data = await rawApi.doGet(path, params);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
    }

    return data;
}

function cacheKey(path, params) {
    let key = path.replaceAll('/', '-').slice(1);

    const customerId = params.customerId || params.CustomerId;
    if (customerId) {
        key += '-' + customerId;
    }
    return key;
}
