#!/usr/bin/env node

const express = require('express');
const GifEncoder = require('gifencoder');
const { createCanvas } = require('canvas');
const { Life } = require('dat-life');
const { Contributions } = require('contributions');

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
    setTimeout(drawGraph, 1000, args);
}

function fillGraph(life, contributions) {
    const days = contributions.getDays();

    for (let i = 0; i < days.length; i++) {
        const x = Math.floor(i / 7);
        const y = (i % 7);

        life.set(x, y, days[i].getIntensity());
    }
}

app.get('/', async function(req, res) {
    res.append('Location', 'https://github.com/ethomson/github4life');
    res.sendStatus(302);
});

app.get('/:username', async function(req, res) {
    let contributions;

    try {
        contributions = await Contributions.forUser(req.params.username);
    }
    catch (err) {
        res.sendStatus(404);
        return;
    }

    const encoder = new GifEncoder(854 * scaling, 112 * scaling);
    encoder.createReadStream().pipe(res);

    encoder.start();
    encoder.setRepeat(-1);
    encoder.setDelay(1);
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
        context: context
    });
});

app.listen(process.env.PORT || 8080);
