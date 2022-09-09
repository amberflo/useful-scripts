BASE_URL = https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws

.PHONY:
all: ec2-all.csv

index.json:
	wget $(BASE_URL)/index.json -O index.json

ec2-all.csv:
	wget $(BASE_URL)/AmazonEC2/current/index.csv -O ec2-all.csv
