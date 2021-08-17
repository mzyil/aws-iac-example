# aws-iac-example

This is a sample project to mess around with AWS CDK.

There are 2 stacks: "CsvDataImporter" and "Factorialer".

## CsvDataImporter
This a serverless application that works as a CSV importer into a data storage. It is triggered when a CSV file is uploaded to S3 and writes its contents to a RDS MariaDB database.

## Factorialer
This is a containerized application to calculate the factorial of a non-negative integer provided by the user and return the value. It is exposed via a Load Balancer.