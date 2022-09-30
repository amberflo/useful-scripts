'use strict';

const maxRate = process.env.CONCURRENCY || 8;  // limit number of concurrent requests

const fs = require('fs');
const csv = require('csv/sync');
const limit = require('p-limit')(maxRate);
const { CustomerDetailsClient } = require('amberflo-metering-typescript');

const apiKey = process.env.AMBERFLO_API_KEY || '';

const rawApi = new CustomerDetailsClient(apiKey, false);

const productId = '1';

const columns = {
    customers: [
        'customer_id',
        'customer_email',
        'current_invoice_start_date',
        'current_invoice_end_date',
        'current_invoice_pricing_plan_id',
        'current_invoice_payment_status',
        'current_invoice_price_status',
        'current_invoice_item_price',
        'current_invoice_fix_price',
        'current_invoice_prepaid_amount',
        'current_invoice_total_discount',
        'current_invoice_total_price',
        'current_invoice_applied_promotion_id',
    ],
    invoices: [
        'customer_id',
        'start_date',
        'end_date',
        'pricing_plan_id',
        'payment_status',
        'price_status',
        'item_price',
        'fix_price',
        'prepaid_amount',
        'total_discount',
        'total_price',
        'applied_promotion_id',
    ],
    promotions: [
        'customer_id',
        'id',
        'name',
        'applied_date',
    ],
    prepaids: [
        'customer_id',
        'payment_id',
        'payment_status',
        'price',
        'worth',
        'card_type',
        'start_time',
    ],
};

async function main() {
    const data = {
        customers: [],
        invoices: [],
        promotions: [],
        prepaids: [],
    };

    const customers = await cachedGet('/customers');  // use paging endpoint if there are too many customers
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
    const invoices = (await cachedGet(
        '/payments/billing/customer-product-invoice/all',
        { productId, customerId: c.customerId, fromCache: false, withPaymentStatus: true }
    ))
        .map(formatInvoice);

    const promotions = (await cachedGet('/payments/pricing/amberflo/customer-promotions/list', { CustomerId: c.customerId }))
        .map(x => formatPromotion(x, promotionsMap));

    const prepaid = await cachedGet('/payments/billing/customer-prepaid-wallet', { customerId: c.customerId });
    const prepaids = prepaid
        ? prepaid.prepaidCards.map(x => formatPrepaid(c.customerId, x))
        : [];

    console.log({
        customer: c.customerId,
        invoices: invoices.length,
        promotions: promotions.length,
        prepaids: prepaids.length,
    });

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
    data.prepaids.push(...prepaids);
}

function formatInvoice(x) {
    if (x.appliedPromotions.length > 1) {
        console.log('WARN: more than one applied promotion on invoice:', x.invoiceKey);
    }

    return {
        customer_id: x.invoiceKey.customerId,
        start_date: iso(x.invoiceStartTimeInSeconds * 1000),
        end_date: iso(x.invoiceEndTimeInSeconds * 1000),
        pricing_plan_id: x.invoiceKey.productPlanId,
        payment_status: x.paymentStatus,
        price_status: x.invoicePriceStatus,
        item_price: x.totalBill.itemPrice,
        fix_price: x.totalBill.fixPrice,
        prepaid_amount: x.totalBill.prepaid,
        total_discount: x.totalBill.totalDiscount,
        total_price: x.totalBill.totalPrice,
        applied_promotion_id: x.appliedPromotions[0]?.promotionId,
    };
}

function formatPromotion(x, promotionsMap) {
    const p = promotionsMap[x.promotionId];
    return {
        customer_id: x.customerId,
        id: x.promotionId,
        name: p.promotionName,
        applied_date: iso(x.appliedTimeInSeconds * 1000),
        type: p.type,
        duration_cycles: p.promotionTimeLimit.cycles,
    };
}

function formatPrepaid(customerId, x) {
    return {
        customer_id: customerId,
        payment_id: x.paymentId,
        payment_status: x.paymentStatus,
        price: x.price,
        worth: x.worth,
        card_type: x.cardType,
        start_time: iso(x.startTimeInMillis),
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
        //console.log('hit:', filePath);
        data = JSON.parse(fs.readFileSync(filePath));
    } else {
        //console.log('miss:', filePath);
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
