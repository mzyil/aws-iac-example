var express = require("express");

const SAFEST_POSSIBLE_INPUT = 170;
const SERVER_PORT = process.env.SERVER_PORT || 80;

var factorialCache = [];

var app = express();
app.listen(SERVER_PORT, () => {
    console.log("Server running on port", SERVER_PORT);
});

app.get("/calculate/:number", (req, res, next) => {
    let number = req.params.number;
    if (isNaN(number)) {
        res.status(400).send("the parameter must be a number but it was: " + number);
        return;
    }
    if (number < 0 || !Number.isInteger(Number.parseFloat(number))) {
        res.status(400).send("the parameter must be a non-negative integer but it was: " + number);
        return;
    }
    if (number > SAFEST_POSSIBLE_INPUT) {
        res.status(422).send(
            "the given number was too large to be processed by the server, details: "
            + `the limit was ${SAFEST_POSSIBLE_INPUT}, `
            + `the given number was ${number.toString()}`);
        return;
    }
    res.json({result: factorial(number)});
});

/**
 * This was taken from an answer on StackOverflow
 * @link https://stackoverflow.com/a/3959275/2422887
 * @param {number} n a non-negative integer
 */
function factorial(n) {
    if (n == 0 || n == 1) return 1;
    if (factorialCache[n] > 0) return factorialCache[n];
    return factorialCache[n] = factorial(n-1) * n;
}


process.on('SIGINT', () => {
  console.info("Interrupted");
  process.exit(0);
})
