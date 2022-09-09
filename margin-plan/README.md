# Pricing Plan Generator

The goal of these scripts is to facilitate margin analysis against your infrastructure provider, by:
- allowing you to create a "raw cost" pricing plan
- that maps your usage to its raw infrastructure cost
- and you can use in the price modelling tool.

## How to use

Start by setting up your python virtual environment:
```sh
python3 -m virtualenv venv
. venv/bin/activate
pip install -r requirements.txt
```

First, download the AWS EC2 pricing data:
```sh
make -C aws-pricing-data/
```

Now, create your mapping configuration file. See [sample-config.json](./sample-config.json) for an example.

Then, run the [map](./map.py) script, to create the raw price matrix.
```sh
./map.py ./aws-pricing-data/ec2-all.csv ./sample-config.json ./sample-price-matrix.json
```

You might want to check the generated price matrix (`./sample-price-matrix.json` in the example) to make sure:
- all desired dimension combinations are there, and
- there are no duplicates.

Finally, run the [setup](./setup.py) script, to create the pricing plan based on the generated price matrix.
```sh
export API_KEY='your-api-key'
./setup.py ./sample-config.json ./sample-price-matrix.json
```

## Config File Schema

```
{
    "conditions": {  # required by ./map.py
        "<dimension-name>": {
            "<dimensions-value>": {
                "<aws-pricing-data-field>": "<aws-pricing-data-value>"
                ...
            }
            ...
        }
        ...
    },
    "sources": [  # optional, used by ./map.py
        [<dimensions-value>, <dimension-value>, ...]
        ...
    ],
    "pre_conditions": {  # optional, used by ./map.py
        "<aws-pricing-data-field>": "<aws-pricing-data-value>"
        ...
    },
    "meter_api_name": "<meter_api_name>",  # required by ./setup.py
    "product_plan_override": {  # optional, used by ./setup.py

    }
}
```
