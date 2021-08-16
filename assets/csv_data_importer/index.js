const aws = require('aws-sdk');
const deepEqual = require("deep-equal");
const parse = require("@fast-csv/parse");
const knexBase = require('knex');


const DATABASE_SECRET_NAME = process.env.DATABASE_SECRET_NAME;
const ID_COLUMN_NAME = "id";
const TABLE_NAME = "hwlog";

var knex = undefined;
const s3 = new aws.S3({ apiVersion: '2006-03-01' });
const sm = new aws.SecretsManager({ region: "eu-central-1" });

function getS3Stream(event) {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const params = {
        Bucket: bucket,
        Key: key,
    };
    try {
        return s3.getObject(params).createReadStream();
    } catch (err) {
        console.log(err);
        const message = `Error getting object ${key} from bucket ${bucket}. Make sure they exist and your bucket is in the same region as this function.`;
        console.log(message);
        throw new Error(message);
    }
}

async function makeConnection() {
    if(knex !== undefined) return; 
    const data = JSON.parse((await sm.getSecretValue({SecretId: DATABASE_SECRET_NAME}).promise()).SecretString);
   
    knex = knexBase({
        client: 'mysql2',
        connection: {
            database: data.dbname,
            host: data.host,
            password: data.password,
            user: data.username
        },
    });
}

exports.handler = async (event, context) => {
    console.log(event.Records[0].s3); 
    try {
        await makeConnection();
    } catch (err) {
        throw new Error("could not connect to the database, details: " + err.stack);
    }

    let done = false;
    let promises = [];
    let rowCount = 0;
    let rows = [];
    let s3Stream = getS3Stream(event);

    function processRows(data) {
        if (rows.length == 5000) {
            let tempArr = Array.from(rows);
            let countAt = rowCount;
            let promise = knex.batchInsert(TABLE_NAME, tempArr, 1000)
                .then(() => {
                    tempArr.length = 0;
                    console.log("process ended for row count:", countAt);
                });
            promises.push(promise);
            rows.length = 0;
        }
        rows.push(data);
        rowCount++;
    }

    async function processHeaders(headers) {
        // create the table if it is not created
        // error out if the fields do not match
        knex.schema.hasTable(TABLE_NAME).then(async function(exists) {
            if (exists) {
                let sortedHeaders = Array.from(headers);
                sortedHeaders.push(ID_COLUMN_NAME);
                sortedHeaders.sort()
    
                let existingColumns = await knex(TABLE_NAME).columnInfo();
                let sortedExistingColumns = Object.keys(existingColumns).sort();
                
                if (!deepEqual(sortedExistingColumns, sortedHeaders)) {
                    throw new Error("the table columns does not match the headers in the file, details: \n" + 
                        `table columns are: ${JSON.stringify(sortedExistingColumns)}\n` +
                        `headers are: ${JSON.stringify(sortedHeaders)}`)
                }
            } else {
                await knex.schema.createTable(TABLE_NAME, function(table) {
                    table.increments(ID_COLUMN_NAME).primary();
                    // perform no data type transformation as its outside of the scope of this project
                    for (let header of headers) {
                        table.string(header, 32);
                    }
                });
            }
        });
    }

    async function awaitProcessing(totalRowCount) {
        promises.push(
            knex
                .batchInsert(TABLE_NAME, rows, 1000)
                .then(() => {
                    console.log("process ended for the remainders:", rows.length);
                    rows.length = 0;
                }));
        await Promise.all(promises);
        console.log("processed", totalRowCount, "rows");
        done = true;
    }

    function transformHeaders(rawHeaders) {
        rawHeaders[0] = "time";
        return rawHeaders;
    }

    parse.parseStream(s3Stream, { skipRows: 1, headers: transformHeaders })
        .on("headers", processHeaders)
        .on("data", processRows)
        .on("end", awaitProcessing);

    return new Promise(async(resolve, _) => {
        await (async function waitForProcessing(){
            if (done) return resolve(done);
            setTimeout(waitForProcessing, 1);
        })();
    });
};