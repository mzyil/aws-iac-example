#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CsvDataImporterStack } from '../lib/csv-data-importer-stack';
import { FactorialerStack } from '../lib/factorialer-stack';

const app = new cdk.App();
new CsvDataImporterStack(app, 'CsvDataImporter', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    },
    stackName: "CsvDataImporterStack"
});
new FactorialerStack(app, 'Factorialer', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    },
    stackName: "FactorialerStack"
});
