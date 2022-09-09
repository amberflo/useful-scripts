#!/usr/bin/env python3

import sys
import os
import json

from metering.session.api_session import ApiSession


api_key = os.getenv("API_KEY")
api = ApiSession(api_key)


def load_price_matrix(price_matrix_fn):
    with open(price_matrix_fn, "r") as f:
        return json.load(f)


def load_config(config_fn):
    with open(config_fn, "r") as f:
        config = json.load(f)

        meter_api_name = config["meter_api_name"]
        dimensions = list(config["conditions"].keys())
        product_plan_override = config.get("product_plan_override") or {}

        return (
            meter_api_name,
            dimensions,
            product_plan_override,
        )


def get_meter(meter_api_name):
    meters = api.get("/meters", {"meterApiName": meter_api_name})
    return meters[0] if meters else None


def create_meter(meter_api_name, dimensions):
    return api.post(
        "/meters",
        {
            "label": meter_api_name.replace("-", " ").title(),
            "meterApiName": meter_api_name,
            "meterType": "sum_of_all_usage",
            "dimensions": dimensions,
            "useInBilling": True,
        },
    )


def get_product_item(meter_api_name):
    items = api.get("/payments/pricing/amberflo/account-pricing/product-items/list")
    for item in items:
        if item["meterApiName"] == meter_api_name:
            return item


def get_product_item_prices(product_item_id):
    return api.get(
        "/payments/pricing/amberflo/account-pricing/product-item-prices",
        {"productItemId": product_item_id},
    )


def upsert_product_item_prices(
    product_item_id, product_item_price_id, dimensions, price_matrix
):
    pi_id = product_item_id
    pip_id = product_item_price_id

    product_item_prices = api.get(
        "/payments/pricing/amberflo/account-pricing/product-item-prices",
        {"productItemId": pi_id},
    )

    if not product_item_prices:
        product_item_prices = {
            "productItemId": pi_id,
            "productItemPriceMap": {},
            "lockingStatus": "open",
        }

    dimension_prices = [
        {
            "dimensionValues": dimension_values,
            "leafNode": {
                "type": "PricePerUnitLeafNode",
                "tiers": [
                    {
                        "startAfterUnit": 0,
                        "batchSize": 1,
                        "pricePerBatch": price,
                    }
                ],
                "allowPartialBatch": True,
            },
        }
        for [*dimension_values, price] in price_matrix
    ]

    product_item_price = {
        "id": pip_id,
        "productItemId": pi_id,
        "productItemPriceName": pip_id,
        "lockingStatus": "open",
        "price": {
            "type": "DimensionMatrixNode",
            "dimensionKeys": dimensions,
            "dimensionsPrices": dimension_prices,
        },
    }

    log("Generated product item price", product_item_price)

    product_item_prices["productItemPriceMap"][pip_id] = product_item_price

    return api.post(
        "/payments/pricing/amberflo/account-pricing/product-item-prices",
        product_item_prices,
    )


def upsert_product_plan(product_plan_override, product_item_id, product_item_price_id):
    product_plan = {
        "id": "raw-ec2-cost",
        "productPlanName": "Raw EC2 cost",
        "description": "",
        "productId": "1",
        "billingPeriod": {"interval": "month", "intervalsCount": 1},
        "feeMap": {},
        "lockingStatus": "open",
    }
    product_plan.update(product_plan_override)

    product_plan["productItemPriceIdsMap"] = {
        product_item_id: product_item_price_id,
    }

    return api.post(
        "/payments/pricing/amberflo/account-pricing/product-plans", product_plan
    )


def parse_args():
    sys.argv.pop(0)

    if len(sys.argv) != 2:
        print("Invalid number of arguments", file=sys.stderr)
        sys.exit(1)

    return sys.argv


def log(msg, data):
    print("INFO:", msg)
    print(json.dumps(data, indent=4))


def die(*msg):
    print("ERROR:", *msg, file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    config_fn, price_matrix_fn = parse_args()

    meter_api_name, dimensions, product_plan_override = load_config(config_fn)

    price_matrix = load_price_matrix(price_matrix_fn)

    meter = get_meter(meter_api_name)
    if not meter:
        # meter = create_meter(meter_api_name, dimensions)
        die("Meter not found:", meter_api_name)
    log("Found meter", meter)

    if not set(dimensions).issubset(meter['dimensions'] or []):
        die("Required dimensions not present in meter definition")

    product_item = get_product_item(meter_api_name)
    if not product_item:
        die("Product item not found for meter:", meter_api_name)
    log("Found product item", product_item)

    product_item_price_id = meter_api_name + "-cost-price"

    product_item_prices = upsert_product_item_prices(
        product_item["id"], product_item_price_id, dimensions, price_matrix
    )
    log("Upserted product item prices", product_item_prices)

    product_plan = upsert_product_plan(
        product_plan_override, product_item["id"], product_item_price_id
    )
    log("Upserted product plan", product_plan)
