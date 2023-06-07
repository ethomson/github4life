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

const imageCache = {
    date: undefined,
    dark: { },
    light: { }
};

const app = express();

/* light mode */
const backgrounds = {
  'light': [ 255, 255, 255 ],
  'dark':  [   0,   0,   0 ]
};
const palettes = {
  'light': [
             [ 235, 237, 240 ],
             [ 172, 230, 174 ],
             [ 105, 192, 110 ],
             [  84, 158,  87 ],
             [  56, 107,  62 ]
           ],
  'dark':  [
             [ 23, 27, 33 ],
             [ 31, 67, 43 ],
             [ 46, 107, 56 ],
             [ 82, 164,  78 ],
             [ 108, 208,  100 ]
           ]
};

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

    const background = args.dark ? backgrounds.dark : backgrounds.light;
    const palette = args.dark ? palettes.dark : palettes.light;

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

function getCachedImage(username, dark) {
    const date = getDate();

    if (imageCache.date !== date) {
        console.log(`Image cache is from ${imageCache.date ? imageCache.date : '(never)'}, invalidating`);

        imageCache.date = date;
        imageCache.dark = { };
        imageCache.light = { };
    }

    if (dark && imageCache.dark[username]) {
        console.log(`Using cached (dark mode) image data for ${username}`);
        return imageCache.dark[username];
    }

    if (!dark && imageCache.light[username]) {
        console.log(`Using cached (light mode) image data for ${username}`);
        return imageCache.light[username];
    }
}

function saveCachedImage(username, data, dark) {
    console.log(`Saving cached ${dark ? 'dark mode' : 'light mode'} image data for ${username}`);

    if (dark) {
      imageCache.dark[username] = data;
    } else {
      imageCache.light[username] = data;
    }
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
    let seed = false;
    let dark = false;

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

    if (req.query.seed === 'true') {
        camo = true;
        seed = true;
    }

    if (req.query.dark === 'true') {
        dark = true;
    }

    if (req.query.cachebust === 'true') {
        contributionCache.users[req.params.username] = undefined;
        imageCache.dark[req.params.username] = undefined;
        imageCache.light[req.params.username] = undefined;
    }

    console.log(`Request from ${req.headers['user-agent']}: camo mode: ${camo}, seed mode: ${seed}, cache bust mode: ${req.query.cachebust}`);

    if (camo && (image = getCachedImage(req.params.username, dark))) {
        console.log(`Using cached image for ${req.params.username}`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
        res.type('gif');
        res.send(image);
        return;
    }
    else if (camo) {
        console.log(`No cached ${dark ? 'dark mode' : 'light mode'} image for ${req.params.username}`);
    }

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
    const encoderStream = encoder.createReadStream();
    encoderStream.pipe(res);

    if (camo) {
        let buf = Buffer.alloc(0);
        encoderStream.on('data', function(d) { buf = Buffer.concat([buf, d]); });
        encoderStream.on('end', function() { saveCachedImage(req.params.username, buf, dark); });
    }

    encoder.start();
    encoder.setRepeat(-1);
    encoder.setDelay(camo ? 1000 : 0);
    encoder.setQuality(75);

    const canvas = createCanvas(854 * scaling, 112 * scaling);
    const context = canvas.getContext('2d');

    const life = new Life(53, 7);
    life.setColors(4);
    life.setDecay(true);

    fillGraph(life, contributions);

    let frames = camo ? 50 : 2147483647;

    if (seed) {
        frames = 250;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    res.type('gif');
    drawGraph({
        response: res,
        life: life,
        contributions: contributions,
        encoder: encoder,
        context: context,
        frames: frames,
        delay: camo ? 0 : 1000,
        dark: dark
    });
});

app.get('/:username', async function(req, res) {
    const params = req.query.camo === 'true' ? '?camo=true' : '';

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

<h3 style="margin: 0 0 5px 23px; padding: 0;">${req.params.username}</h3>
</div>

<div style="width: 990px; margin: auto;">
<img src="/${req.params.username}.gif${params}" style="width: 854px; height: 112px; margin: 0 0 0 136px; padding: 0;">
</div>

<div style="width: 718px; margin: auto; padding: 0;">
<h3 style="margin: 40px 0 0 0;">What's this?</h3>

<p>
This is "GitHub 4 Life" - so named because it takes a <i><b>GitHub</b></i> contribution graph and turns it into a <i><b>4</b></i> color Game of <i><b>Life</b></i>.
</p>

<p>
The GitHub contribution graph is used as the initial state for <a href="https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life">Conway's Game of Life</a>, a popular cellular automaton that is often built by beginning software developers as an easy-to-implement but interesting piece of software.
</p>

<p>
Conway's Game of Life only defines two initial states for cells, but there are <a href="https://conwaylife.com/ref/mniemiec/color.htm">multi-color variants</a>.  This is a variant of "Quad Life" (chosen because the GitHub contribution graph has four colors that represent the intensity of contributions for a given day): in the typical Game of Life rules, a graph with a lot of contribution would die out in the first iteration (because the cells would be overcrowded), which seems to punish those with a lot of contributions, giving them a boring Game of Life. Intead, this variant "decays" the level of contribution, so cells will fade away instead of dying immediately.
</p>

<h3>How does it work?</h3>

<p>
This uses a JavaScript library called <a href="https://npmjs.com/contributions">contributions</a> to create a data structure with a GitHub contribution graph, and uses that as the initial state for another JavaScript library called <a href="https://npmjs.com/dat-life">dat-life</a>.  The <a href="https://github.com/ethomson/github4life">github4life</a> application then renders this as an animated GIF.  It does this indefinitely; it will render the game of life on-demand - infinitely continuing to deliver you the next state as a new frame in the GIF, forever.
</p>

<p style="margin-bottom: 60px;">
By <a href="https://github.com/ethomson">Edward Thomson</a>, 2020.
</p>
</div>
</body>
</html>`);
});

app.listen(process.env.PORT || 8080);
