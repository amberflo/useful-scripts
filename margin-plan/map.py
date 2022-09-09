#!/usr/bin/env python3

import csv
import json
import sys
import itertools

DEFAULT_PRE_CONDITIONS = {
    "Product Family": "Compute Instance",
    "Operating System": "Linux",
    "LeaseContractLength": "",
    "TermType": "OnDemand",
    "Pre Installed S/W": "NA",
    "Tenancy": "Shared",
    "CapacityStatus": "Used",
    "Currency": "USD",
}


def pre_check(row):
    """
    This filter checks some generic, non-equality conditions on the pricing data row.
    """
    return row["Instance Type"] or float(row["PricePerUnit"]) > 0


def check(row, conditions):
    """
    This filter applies a set of equality conditions on the pricing data row.
    """
    return all(row[k] == v for (k, v) in conditions)


def build_selector(sources, conditions_list):
    """
    Given
    - a list of sources (rows of the price matrix)
    - the list of conditions to be applied on each column

    this function returns a selector function that yields the price per source
    row.
    """

    # Pre-compute stuff out of the hot loop.
    source_conditions = [
        [
            source,
            [
                item
                for x in [f[s] for (s, f) in zip(source, conditions_list)]
                for item in x.items()
            ],
        ]
        for source in sources
    ]

    def selector(rows):
        """
        This function filters the pricing data (rows) and yields the price per source.
        """
        for row in rows:
            if not pre_check(row) or not check(row, pre_conditions):
                continue

            for source, conditions in source_conditions:
                if check(row, conditions):
                    yield [*source, float(row["PricePerUnit"])]

    return selector


def read_pricing_data(pricing_data_fn):
    file = open(pricing_data_fn, "r")

    # AWS pricing csv has a header, skip it
    for _ in range(5):
        file.readline()

    return csv.DictReader(file)


def load_config(config_fn):
    with open(config_fn, "r") as f:
        config = json.load(f)

        conditions_list = list(config["conditions"].values())

        sources = config.get("sources") or list(
            itertools.product(*(l.keys() for l in conditions_list))
        )

        pre_conditions = config.get("pre_conditions") or DEFAULT_PRE_CONDITIONS

        return (
            sources,
            conditions_list,
            [(k, v) for (k, v) in pre_conditions.items()],
        )


def parse_args():
    sys.argv.pop(0)

    if len(sys.argv) != 3:
        print("Invalid number of arguments", file=sys.stderr)
        sys.exit(1)

    return sys.argv


if __name__ == "__main__":
    pricing_data_fn, config_fn, out_fn = parse_args()

    sources, conditions_list, pre_conditions = load_config(config_fn)

    select = build_selector(sources, conditions_list)

    reader = read_pricing_data(pricing_data_fn)

    price_matrix = sorted(select(reader))

    with open(out_fn, "w") as f:
        json.dump(price_matrix, f, indent=4)
