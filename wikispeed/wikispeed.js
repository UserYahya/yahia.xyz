const gaugeNodes = document.getElementsByClassName('gauge');
const beginTimestamp = Date.now()/1000;
const counterPeriod = 60; // 60 seconds
const editsInLastMinute = {}; // List of arrays containing the timestamps of recent edits per wiki
const gaugeCharts = {}; // List of charts
const wikisToTrack = ['global', 'bnwiki', 'bnwikivoyage', 'bnwiktionary', 'bnwikibooks', 'bnwikiquote', 'wikidatawiki', 'commonswiki'];
const perMinuteWikis = ['global', 'wikidatawiki', 'commonswiki'];

// Set up charts
for (const elem of gaugeNodes) {
    const id = elem.id;
    editsInLastMinute[id] = [];

    const isPerMinute = perMinuteWikis.includes(id);
    const maxValue = isPerMinute ? 600 : 10; // 600 edits/min or 10 edits/sec

    // Set up the gauge charts
    try {
        gaugeCharts[id] = Highcharts.chart(id, {
            chart: {
                type: 'gauge',
                plotBackgroundColor: null,
                plotBackgroundImage: null,
                plotBorderWidth: 0,
                plotShadow: false,
                height: '100%'
            },
            title: {
                text: elem.title
            },
            pane: {
                startAngle: -150,
                endAngle: 150
            },
            yAxis: {
                min: 0,
                max: maxValue,
                minorTickInterval: 'auto',
                minorTickWidth: 1,
                minorTickLength: 10,
                minorTickPosition: 'inside',
                minorTickColor: '#666',
                tickPixelInterval: 30,
                tickWidth: 2,
                tickPosition: 'inside',
                tickLength: 10,
                tickColor: '#666',
                labels: {
                    step: 2,
                    rotation: 'auto'
                },
                title: {
                    text: isPerMinute ? 'edits/min' : 'edits/sec'
                },
                plotBands: [{
                    from: 0,
                    to: maxValue * 0.33,
                    color: '#55BF3B' // green
                }, {
                    from: maxValue * 0.33,
                    to: maxValue * 0.67,
                    color: '#DDDF0D' // yellow
                }, {
                    from: maxValue * 0.67,
                    to: maxValue,
                    color: '#DF5353' // red
                }]
            },
            series: [{
                name: 'Speed',
                data: [0],
                tooltip: {
                    valueSuffix: isPerMinute ? ' edits/min' : ' edits/sec'
                }
            }]
        });
    } catch (error) {
        console.error(`Error creating chart for ${id}:`, error);
    }
}

// Set up event stream
const editsFeed = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');

editsFeed.onopen = () => {
    console.info('Connected to the Wikimedia EventStreams service.');
};

editsFeed.onmessage = (event) => {
    const eventData = JSON.parse(event.data);

    if (eventData.meta?.domain === 'canary') {
        return;
    }

    if (wikisToTrack.includes(eventData.wiki)) {
        editsInLastMinute[eventData.wiki].push(eventData.timestamp);
    }
    
    if (eventData.server_name.match("wikipedia") || eventData.wiki === "wikidatawiki" || eventData.wiki === "commonswiki") {
        editsInLastMinute["global"].push(eventData.timestamp);
    }
};

editsFeed.onerror = (event) => {
    console.error('Encountered error', event);
};

// Update counters
function updateCounters() {
    const now = Date.now() / 1000;
    const elapsed = now - beginTimestamp;

    for (const id in editsInLastMinute) {
        const isPerMinute = perMinuteWikis.includes(id);
        let currentCount;
        
        if (elapsed < counterPeriod) {
            currentCount = editsInLastMinute[id].length * (isPerMinute ? 1 : 60) / elapsed;
        } else {
            editsInLastMinute[id] = editsInLastMinute[id].filter(editTimestamp => editTimestamp > (now - counterPeriod));
            currentCount = editsInLastMinute[id].length * (isPerMinute ? 1 : 1/60);
        }
        
        if (gaugeCharts[id] && gaugeCharts[id].series[0]) {
            try {
                gaugeCharts[id].series[0].points[0].update(Math.min(currentCount, gaugeCharts[id].yAxis[0].max));
            } catch (error) {
                console.error(`Error updating chart for ${id}:`, error);
            }
        }
    }
}

// Start the update loop
const loopID = setInterval(updateCounters, 1000);

// Clean up before exiting
window.onbeforeunload = function() {
    editsFeed.close();
    clearInterval(loopID);
};