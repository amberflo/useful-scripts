# Data Export Scripts

These are scripts to export data as CSV files.

## How to Use

1. Install the dependencies (this was tested with Node.js 16)
```sh
npm install
```

2. Export your Amberflo API key
```sh
export AMBERFLO_API_KEY='...'
```

3. Run the script
```sh
node index.js
```

## Caching

The script will make a number of API calls proportional to the number of customers you have on Amberflo, which can be a lot, a so it can take some time to run.

For this reason, we cache all the API responses, and avoid making the API call again if the cache entry is present.

Each API call is saved in a `.json` file in the `./cache` directory.

To clear the cache, simply remove the `.json` files in the directory.
```sh
rm ./cache/*.json
```

## Concurrency

The invoice request is somewhat heavy and accesses external APIs (e.g. Stripe). Unlimitted concurrency can cause the external APIs to rate-limit, and the API calls to fail.

To avoid this, we limit the number of concurrent requests.

You can adjust it with
```sh
export CONCURRENCY=8
```
