#!/usr/bin/env node

const express = require('express');
const GifEncoder = require('gifencoder');
const { createCanvas } = require('canvas');
const { Life } = require('dat-life');
const { Contributions } = require('contributions');

const contributionCache = {
    date: undefined,
    users: { }
};

const app = express();

const background = [ 255, 255, 255 ];

const palette = [
    [ 235, 237, 240 ],
    [ 172, 230, 174 ],
    [ 105, 192, 110 ],
    [  84, 158,  87 ],
    [  56, 107,  62 ]
];

const scaling = 2;
const squareSize = 10 * scaling;
const spacing = 3 * scaling;

const headerWidth = 24 * scaling;
const headerHeight = 15 * scaling;

function drawGraph(args) {
    const life = args.life;
    const contributions = args.contributions;
    const context = args.context;
    const encoder = args.encoder;
    const res = args.response;
    const delay = args.delay;
    const frames = args.frames;

    const days = contributions.getDays();
    const dimensions = life.getWidth() * life.getHeight();

    if (res.connection.destroyed) {
        return;
    }

    context.fillStyle = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);

    context.font = `${9 * scaling}px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji`;
    context.fillStyle = `rgb(118, 118, 118)`;

    // draw the days of week
    context.fillText('Mon', 0, headerHeight + (22 * scaling));
    context.fillText('Wed', 0, headerHeight + (48 * scaling));
    context.fillText('Fri', 0, headerHeight + (73 * scaling));

    // draw the months
    for (let x = 0; x < 53; x++) {
        const months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
            'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];

        const weekDate = new Date(days[(7 * x)].getDate());

        if (weekDate.getDate() <= 7) {
            const month = months[weekDate.getMonth()];
            context.fillText(month, headerWidth + (x * (squareSize + spacing)), 20);
        }
    }

    // draw contribution squares
    for (let idx = 0; idx < days.length; idx++) {
        const x = Math.floor(idx / 7);
        const y = (idx % 7);
        const intensity = life.get(x, y);
        const color = palette[intensity];

        if (idx > days.length) {
            continue;
        }

        const contextX = headerWidth + (x * (squareSize + spacing));
        const contextY = headerHeight + (y * (squareSize + spacing));

        context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        context.fillRect(contextX, contextY, squareSize, squareSize);
    }

    // clear any remainder from the life board so that invisible squares
    // don't contribute to the next generation
    for (let remain = days.length; remain < dimensions; remain++) {
        const x = Math.floor(remain / 7);
        const y = (remain % 7);

        life.set(x, y, 0);
    }

    encoder.addFrame(context);

    life.next();

    if (--args.frames) {
        if (delay)
            setTimeout(drawGraph, delay, args);
        else
            drawGraph(args);
    }
    else {
        encoder.finish();
    }
}

function fillGraph(life, contributions) {
    const days = contributions.getDays();

    for (let i = 0; i < days.length; i++) {
        const x = Math.floor(i / 7);
        const y = (i % 7);

        life.set(x, y, days[i].getIntensity());
    }
}

function getDate() {
    const today = new Date();

    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    return year + '-' +
        (month < 10) ? '0' : '' + month +
        (day < 10) ? '0' : '' + day;
}

async function getContributions(username) {
    const date = getDate();

    if (contributionCache.date !== date) {
        console.log(`Contribution cache is from ${contributionCache.date ? contributionCache.date : '(never)'}, invalidating`);

        contributionCache.date = date;
        contributionCache.users = { };
    }

    if (contributionCache.users[username]) {
        console.log(`Using cached contributions data for ${username}`);
        return contributionCache.users[username];
    }

    const contributions = await Contributions.forUser(username);

    console.log(`Saving contributions data for ${username}`);
    contributionCache.users[username] = contributions;

    return contributions;
}

app.get('/', async function(req, res) {
    res.append('Location', 'https://github.com/ethomson/github4life');
    res.sendStatus(302);
});

app.get('/:username.gif', async function(req, res) {
    let camo = false;

    // Generally we want to deliver frames forever, so for interactive
    // user agents we don't put a delay into the gif itself, we just
    // send new frames every 1000ms.  For caching services, though,
    // we want to deliver a set number of frames, with the gif's frame
    // delay set to 1000ms.  We want to do this immediately so that the
    // request doesn't time out.
    if (req.headers['user-agent'].match(/^github-camo/)) {
        camo = true;
    }

    if (req.query.camo === 'true') {
        camo = true;
    }

    console.log(`Request from ${req.headers['user-agent']}: camo mode: ${camo}`);

    let contributions;
    try {
        contributions = await getContributions(req.params.username);
    }
    catch (err) {
        console.error(`Could not get contribution graph for ${req.params.username}: ${err}`);
        res.sendStatus(404);
        return;
    }

    const encoder = new GifEncoder(854 * scaling, 112 * scaling);
    encoder.createReadStream().pipe(res);

    encoder.start();
    encoder.setRepeat(-1);
    encoder.setDelay(camo ? 1000 : 0);
    encoder.setQuality(15);

    const canvas = createCanvas(854 * scaling, 112 * scaling);
    const context = canvas.getContext('2d');

    const life = new Life(53, 7);
    life.setColors(4);
    life.setDecay(true);

    fillGraph(life, contributions);

    res.type('gif');
    drawGraph({
        response: res,
        life: life,
        contributions: contributions,
        encoder: encoder,
        context: context,
        frames: camo ? 100 : 2147483647,
        delay: camo ? 0 : 1000
    });
});

app.get('/:username', async function(req, res) {
    res.send(`<html>
<head>
<title>GitHub 4 Life</title>
</head>
<body style="font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji;">
<div style="width: 718px; margin: auto; padding: 0;">
<h1>GitHub 4 Life</h1>

<p>
A four-color game of life based on your GitHub contribution graph.
</p>

<h3 style="margin: 0; padding: 0;">${req.params.username}</h3>
</div>

<div style="width: 990px; margin: auto;">
<img src="/${req.params.username}.gif" style="width: 854px; height: 112px; margin: 0 0 0 136px; padding: 0;">
</div>
</body>
</html>`);
});

app.listen(process.env.PORT || 8080);
