# **Technical Architecture and Mobile UX Optimization Report for mcspeedrun.bond**

## **Architectural Refactoring of the Serverless Filter and Sorting Layer (api/runs.js)**

Minecraft Random Seed Glitchless (RSG) speedrunning requires managing a high volume of active runs, placing a heavy load on both the community and the database.1 On Speedrun.com, the raw, unfiltered unverified run queue is slow and prone to timeouts or HTTP 503 errors.1 This latency is caused by the database structure and the limitations of paginated queries, which cap standard pages at 200 runs and bulk requests at 1000\.1 When retrieving data via APIs, traversing these large queues can take several minutes, creating a significant bottleneck for moderators reviewing runs.1  
To resolve this bottleneck on mcspeedrun.bond, the backend routing logic in the serverless function api/runs.js must be refactored. Rather than retrieving wide datasets and sorting them in the client browser, the platform must delegate sorting, pagination, and filtering directly to the Speedrun.com REST API.2 The API allows filtering via URL query parameters, including options for specific platforms, regions, video requirements, emulators, and custom variables.2  
Custom variables are particularly important for RSG players, who often need to filter runs by game version (such as 1.16.1), world generation type, or category extensions.2 To filter by these variables, the query must target the specific variable ID and value ID assigned by Speedrun.com.4 For example, the query string must append the variable in the format var-VARIABLE\_ID=VALUE\_ID to isolate those runs on the leaderboard.2  
To ensure the platform remains stable under heavy use, it must also stay within the official API rate limit of 120 requests per minute per IP and API key.5 When this limit is exceeded, the server returns an HTTP 429 status code along with a retry-after header, which indicates the number of seconds the client must wait before making new requests.5  
To address these constraints, the serverless function api/runs.js should use an edge-caching model. Let ![][image1] be the rate of incoming user requests for the RSG unverified queue. Without caching, the load on the upstream API is equal to ![][image1]. By implementing an edge-cache with a hit ratio ![][image2], the upstream request rate ![][image3] is defined as:  
![][image4]  
The efficiency of this cache is determined by the request density ![][image5] and the cache time-to-live (TTL) ![][image6]:  
![][image7]  
By maintaining a sliding-window TTL of ![][image8] (5 minutes), the upstream load is bound to a maximum of 1 request per 5 minutes per unique query path, staying safely below the 120 requests/minute restriction.5  
The table below outlines the mapping of parameters from mcspeedrun.bond to the upstream API to optimize query performance and bypass verification bottlenecks.

| Front-End Parameter | Upstream API Parameter | JSON Path & Value | System Function |
| :---- | :---- | :---- | :---- |
| queueStatus | status | ?status=new | Restricts the payload to unverified runs, reducing data transfer.1 |
| sortMetric | order\_by | ?order\_by=verify-date | Orders the queue by submission milestones to maintain a chronological review pipeline.1 |
| sortOrder | sort\_direction | ?sort\_direction=desc | Places the newest runs at the top of the queue for immediate visibility.1 |
| regionFilter | region | ?region={regionId} | Filters runs by geographic region to help distribute moderation tasks.2 |
| mcVersion | var-{versionVarId} | ?var-6wl339l1=45lmxy1v | Uses custom variables to filter for specific game versions, like Minecraft 1.16.1.2 |
| runCategory | category | /category/{categoryId} | Pulls data from specific category leaderboards, bypassing unrelated runs.2 |

The serverless function below demonstrates how to construct these queries dynamically, handle caching, parse retry-after headers, and set a descriptive User-Agent to optimize performance and prevent rate-limiting issues.3

JavaScript  
// Serverless controller: api/runs.js  
import { kv } from '@vercel/kv';

export default async function handler(req, res) {  
    const { category, version, region, status \= 'new', page \= 1 } \= req.query;  
      
    // Construct a unique cache key based on the query parameters  
    const cacheKey \= \`runs:${category}:${version}:${region}:${status}:${page}\`;  
      
    try {  
        // Query the edge cache first to reduce direct API calls  
        const cachedData \= await kv.get(cacheKey);  
        if (cachedData) {  
            res.setHeader('X-Cache', 'HIT');  
            return res.status(200).json(JSON.parse(cachedData));  
        }  
    } catch (cacheError) {  
        console.error('Cache connection failure:', cacheError);  
    }

    // Build the request URL for the Speedrun.com API  
    const baseUrl \= \`https://www.speedrun.com/api/v1/runs\`;  
    const queryParams \= new URLSearchParams({  
        game: 'm1mnkej2', // Minecraft: Java Edition ID  
        status: status,  
        order\_by: 'verify-date',  
        sort\_direction: 'desc',  
        embed: 'players,category',  
        offset: ((parseInt(page) \- 1) \* 50).toString(),  
        limit: '50'  
    });

    // Append geographic filters if specified  
    if (region) {  
        queryParams.append('region', region); //   
    }

    // Append custom game variables, such as version constraints  
    if (version) {  
        // Example: Minecraft Version variable ID mapped to the specific version ID  
        const versionVariableId \= '5ly7776l';   
        queryParams.append(\`var-${versionVariableId}\`, version); //   
    }

    const targetUrl \= \`${baseUrl}?${queryParams.toString()}\`;

    try {  
        const apiResponse \= await fetch(targetUrl, {  
            method: 'GET',  
            headers: {  
                // Identify the application to upstream administrators  
                'User-Agent': 'mcspeedrun-bond/1.1.0 (contact@mcspeedrun.bond)', //   
                'Accept': 'application/json'  
            }  
        });

        // Handle rate limiting gracefully  
        if (apiResponse.status \=== 429) {  
            const retryAfterSeconds \= apiResponse.headers.get('Retry-After') || '60'; //   
            res.setHeader('Retry-After', retryAfterSeconds);  
            return res.status(429).json({  
                error: 'Upstream rate limit reached.',  
                retryAfter: parseInt(retryAfterSeconds)  
            });  
        }

        if (\!apiResponse.ok) {  
            return res.status(apiResponse.status).json({ error: 'Failed to retrieve data from upstream API.' });  
        }

        const data \= await apiResponse.json();

        // Save the response to the edge cache with a 5-minute TTL to stay within rate limits  
        try {  
            await kv.set(cacheKey, JSON.stringify(data), { ex: 300 }); //   
        } catch (cacheWriteError) {  
            console.error('Failed to write to edge cache:', cacheWriteError);  
        }

        res.setHeader('X-Cache', 'MISS');  
        return res.status(200).json(data);

    } catch (error) {  
        console.error('API integration error:', error);  
        return res.status(500).json({ error: 'Internal server error occurred while fetching run data.' });  
    }  
}

## **Mobile Accessibility Framework and Responsive Table Adaptation (public/style.css)**

Speedrunners and viewers frequently browse leaderboards and verification queues on mobile screens or secondary tablets during active runs or streams.7 Standard leaderboard layouts are often designed for desktop screens, forcing mobile users to scroll horizontally and making it difficult to find key details like run dates, platforms, and segment times.7  
Feedback from communities like r/MinecraftSpeedrunning highlights major usability issues with these desktop-centric mobile interfaces. Users complain about thin, low-opacity fonts, lowercase headings, and small buttons that are difficult to tap on mobile.7 Browsing category extensions on mobile is particularly frustrating, as interfaces often display only one category at a time or collapse them into hard-to-read nested menus.8  
To solve these issues on mcspeedrun.bond, the stylesheet public/style.css must use a responsive, fluid design. Tabular grids are reserved for larger monitors, while smaller mobile screens dynamically transition to a modern card-style layout.  
Let ![][image9] represent the screen width in pixels. The system scales font sizes dynamically and switches the layout mode based on a ![][image10] breakpoint:  
![][image11]  
This responsive scaling keeps text readable and keeps interactive elements within a comfortable tap range, even on smaller screens.7

| UI Element | Desktop Layout (W≥768px) | Mobile Layout (W\<768px) | Usability Benefit |
| :---- | :---- | :---- | :---- |
| **Grid Structure** | Compact horizontal rows (display: table-row) designed for quick scanning with a mouse. | Stacked vertical cards (display: flex; flex-direction: column) with clear borders. | Eliminates horizontal scrolling and improves readability on narrow viewports.7 |
| **Visual Hierarchy** | Clean columns with subtle dividers and hover states. | Expanded card containers with bold titles and distinct metadata sections. | Separates runs clearly, making it easier to scan lists on a phone.8 |
| **Touch Targets** | Small text links and buttons to maximize data density. | Large tap targets (at least ![][image12]) with ample spacing. | Prevents accidental clicks on adjacent player profiles or category links.7 |
| **Dropdown Menus** | Inline hover menus and dense select boxes. | Broad, touch-friendly select buttons or full-screen overlay drawers. | Simplifies switching categories and browsing category extensions.8 |
| **Timing Displays** | Compact numeric columns (e.g., 01:14:22.45). | Prominent, high-contrast timing badges that highlight millisecond accuracy.9 | Highlights the run's final time, which is the most critical metric for runners.9 |

The CSS block below demonstrates how to implement this responsive card layout, enforce high-contrast typography, and configure touch-action properties to optimize mobile performance.8

CSS  
/\* Responsive Layout and Mobile Card Engine: public/style.css \*/

/\* Define CSS Variables for consistent typography, sizing, and contrast \*/  
:root {  
    \--bg-primary: \#121212;  
    \--bg-secondary: \#1e1e1e;  
    \--accent-blue: \#0070f3;  
    \--text-primary: \#ffffff;  
    \--text-muted: \#b3b3b3;  
    \--touch-target-min: 48px; /\*  \*/  
    \--border-radius: 8px;  
}

/\* Apply responsive font scaling globally \*/  
html {  
    font-size: 16px;  
    background-color: var(--bg-primary);  
    color: var(--text-primary);  
    font-family: \-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;  
    \-webkit-font\-smoothing: antialiased;  
}

/\* Default tabular layout for desktop viewports \*/  
.leaderboard-container {  
    width: 100%;  
    margin: 0 auto;  
    padding: 1.5rem;  
}

.leaderboard-table {  
    width: 100%;  
    border-collapse: collapse;  
    display: table;  
}

.leaderboard-header {  
    display: table-header-group;  
    background-color: var(--bg-secondary);  
}

.leaderboard-row {  
    display: table-row;  
    border-bottom: 1px solid \#2e2e2e;  
}

.leaderboard-cell {  
    display: table-cell;  
    padding: 12px 16px;  
    vertical-align: middle;  
}

/\* Responsive breakpoint for mobile viewports \*/  
@media screen and (max-width: 768px) {  
    /\* Convert the table structure into a vertical card stack \*/  
   .leaderboard-table {  
        display: block;  
    }

   .leaderboard-header {  
        display: none; /\* Hide desktop table headers on mobile \*/  
    }

   .leaderboard-row {  
        display: flex;  
        flex-direction: column;  
        background-color: var(--bg-secondary);  
        margin-bottom: 1rem;  
        border-radius: var(--border-radius);  
        border: 1px solid \#2e2e2e;  
        padding: 1rem;  
    }

   .leaderboard-cell {  
        display: flex;  
        justify-content: space-between;  
        align-items: center;  
        padding: 8px 0;  
        border-bottom: 1px dashed \#2e2e2e;  
    }

   .leaderboard-cell:last-child {  
        border-bottom: none;  
    }

    /\* Add descriptive labels on mobile since the desktop headers are hidden \*/  
   .leaderboard-cell::before {  
        content: attr(data-label);  
        font-weight: 600;  
        color: var(--text-muted);  
        font-size: 0.85rem;  
        text-transform: uppercase;  
    }

    /\* Standardize and expand mobile touch targets \*/  
   .mobile-touch-target {  
        min-height: var(--touch-target-min); /\*  \*/  
        display: inline-flex;  
        align-items: center;  
        justify-content: center;  
        padding: 0 16px;  
        border-radius: 4px;  
        touch-action: manipulation; /\*  \*/  
    }

    /\* Enhance typography opacity and sizing to resolve readability issues \*/  
   .text-runner-name {  
        font-size: 1rem;  
        font-weight: 700;  
        color: var(--text-primary); /\*  \*/  
    }

   .text-run-time {  
        font-size: 1.1rem;  
        font-weight: 800;  
        color: var(--accent-blue); /\*  \*/  
    }  
}

## **Eliminating Touch Friction and Native Gesture Interferences on Mobile Engines**

Mobile web browsers use default touch gestures that can interfere with highly interactive web apps.12 For example, Google Chrome’s "Touch to Search" feature automatically selects tapped plain text (such as a runner's username or world seed) and launches a search bar overlay at the bottom of the screen.12 This behavior can disrupt the user experience by covering up key parts of the dashboard.12  
This search overlay is triggered when a user taps selectable, non-interactive text.12 Web apps can bypass this default behavior by making these text elements appear interactive to the mobile browser.12 Google Chrome automatically ignores "Touch to Search" triggers if the target element meets any of the following criteria 12:

* **Focusability**: Adding a tabindex="-1" attribute to the element.12  
* **Interactivity**: Giving elements accessibility markup like role="button", or attaching active JavaScript click handlers that invoke event.preventDefault().12  
* **Non-selectability**: Setting the CSS rule \-webkit-user-select: none;.12

Mobile browsers also introduce a slight delay (\~300ms) on touch inputs to detect double-taps for zooming.10 This delay can make fast, repetitive interactions feel sluggish.7 The delay can be disabled by applying touch-action: manipulation; in CSS, which allows scrolling and pinching but removes the double-tap delay.10 For highly interactive elements like custom map views, touch-action: none; hands full control over touch gestures to custom JavaScript handlers.10  
To handle double-taps programmatically, the system can track the time interval between consecutive tap events:  
![][image13]  
If ![][image14], the system flags the input as a rapid double-tap and intercepts the default browser zoom.13  
The table below lists common mobile touch interferences, their causes, and how they are resolved on mcspeedrun.bond.

| Native Interference | Root Browser Behavior | Technical Solution | Usability Impact |
| :---- | :---- | :---- | :---- |
| **Accidental Selection** | Long-pressing text triggers the default selection menu or native search bar.12 | Apply \-webkit-user-select: none; and \-webkit-touch-callout: none;.11 | Keeps the layout stable when users tap or drag items on mobile.12 |
| **Touch to Search Overlay** | Tapping plain text (like player names or seeds) opens a search drawer.12 | Add tabindex="-1", role="button", and apply event.preventDefault() on touch.12 | Keeps the user focused on the app by blocking native browser searches.12 |
| **Input Delay** | Browsers pause for \~300ms on taps to check for a zoom gesture.10 | Apply touch-action: manipulation; to the body and buttons.10 | Removes tap latency, making navigation feel instant and responsive.10 |
| **Pinch-to-Zoom Reset** | Accidental multi-finger pinch gestures zoom and distort the layout.13 | Intercept the touchstart event and block default actions when event.touches.length \> 1\.13 | Prevents accidental zooming on the dashboard while speedrunning.13 |
| **Tap Highlight Flash** | Browsers flash a gray background on elements when tapped.11 | Set \-webkit-tap-highlight-color: transparent; in CSS.11 | Removes distracting visual flashes on tap, matching native app behavior.14 |

The code block below demonstrates how to implement these optimizations in public/app.js and public/style.css to ensure smooth, responsive touch interactions.12

CSS  
/\* Touch and Selection Reset: Add to public/style.css \*/

/\* Disable text selection and callouts on interactive elements \*/  
.touch-optimized {  
    \-webkit-touch-callout: none; /\* Disables the native Callout menu on iOS \[11\] \*/  
    \-webkit-user-select: none;   /\* Disables text selection in Webkit engines  \*/  
    \-moz-user-select: none;      /\* Disables selection in Firefox  \*/  
    \-ms-user-select: none;       /\* Disables selection in IE/Edge  \*/  
    user-select: none;           /\* Standard selection prevention property \[13, 14\] \*/  
      
    /\* Disable double-tap zoom delay while keeping pinch-to-zoom intact \*/  
    touch-action: manipulation;  /\*  \*/  
      
    /\* Remove default tap highlight colors on Android and iOS \*/  
    \-webkit-tap-highlight-color: transparent; /\*  \*/  
}

/\* Ensure interactive controls do not show focus borders when tapped \*/  
.touch-optimized:focus {  
    outline: 0; /\*  \*/  
}

JavaScript  
// Mobile Touch and Gestures Controller: public/app.js  
document.addEventListener('DOMContentLoaded', () \=\> {  
    // Target elements containing copyable data like seeds or usernames  
    const copyableCells \= document.querySelectorAll('.copyable-data');  
      
    copyableCells.forEach(cell \=\> {  
        // Assign interactive properties to prevent Chrome's Touch to Search  
        cell.setAttribute('tabindex', '-1'); //   
        cell.setAttribute('role', 'button'); //   
          
        let lastTouchTime \= 0;

        cell.addEventListener('touchend', function(event) {  
            // Intercept and prevent default browser touch gestures  
            event.preventDefault(); // \[12, 14\]  
              
            const currentTime \= Date.now();  
            const tapInterval \= currentTime \- lastTouchTime;  
              
            // Programmatically block rapid double-taps to prevent zoom  
            if (tapInterval \<= 300 && tapInterval \> 0) {  
                return; //   
            }  
            lastTouchTime \= currentTime;  
              
            // Programmatically copy seed or username to clipboard  
            const copyText \= this.getAttribute('data-copy-val') || this.textContent;  
            navigator.clipboard.writeText(copyText)  
               .then(() \=\> {  
                    triggerToastNotification(\`Copied to clipboard: ${copyText}\`);  
                })  
               .catch(err \=\> {  
                    console.error('Clipboard action failed:', err);  
                });  
        }, { passive: false }); // Explicitly non-passive to allow preventDefault()   
    });

    // Prevent multi-finger pinch-to-zoom gestures  
    document.addEventListener('touchstart', (event) \=\> {  
        if (event.touches.length \> 1) {  
            event.preventDefault(); // Blocks default zoom   
        }  
    }, { passive: false });

    // Block native iOS gesture zoom events  
    document.addEventListener('gesturestart', (event) \=\> {  
        event.preventDefault(); //   
    }, { passive: false });  
});

function triggerToastNotification(message) {  
    const toast \= document.getElementById('toast-box') || document.createElement('div');  
    toast.id \= 'toast-box';  
    toast.className \= 'toast-alert-visible';  
    toast.innerText \= message;  
    if (\!document.body.contains(toast)) {  
        document.body.appendChild(toast);  
    }  
    setTimeout(() \=\> {  
        toast.className \= 'toast-alert-hidden';  
    }, 2500);  
}

## **Establishing Site Credibility and Upstream API Rate Compliance**

To build trust within the Minecraft speedrunning community, a third-party tool like mcspeedrun.bond must maintain high standards of transparency, accuracy, and reliable performance. Because the platform relies heavily on the Speedrun.com REST API, it is essential to design around the official API rate limit of 120 requests per minute per IP address and API key.5 Exceeding this limit returns an HTTP 429 status code with a retry-after header, indicating how many seconds the client must wait before making new requests.5  
Without proper rate-limiting and caching, a sudden surge of users on mcspeedrun.bond could easily exhaust this limit, resulting in broken pages and site-wide timeouts.1 To prevent these issues, the platform's backend must implement a robust rate-limiting and caching architecture, drawing on proven patterns from other high-volume APIs.6  
The table below compares different rate-limiting algorithms to determine the best approach for protecting upstream servers and managing user traffic on the serverless gateway.6

| Algorithm | Mechanism | Advantages | Disadvantages | Suitability for mcspeedrun.bond |
| :---- | :---- | :---- | :---- | :---- |
| **Token Bucket** | Tokens refill at a set rate. Requests consume tokens; bursts are allowed up to a maximum limit.6 | Handles sudden, minor traffic bursts smoothly.6 | Complex to implement and maintain in stateless serverless environments.6 | Highly suitable for protecting API search and fetch requests.6 |
| **Leaky Bucket** | Requests are placed in a queue and processed at a steady, fixed rate.6 | Ensures a smooth, predictable flow of outbound requests.6 | Delays requests during bursts, which can impact real-time responsiveness.6 | Best for backend task queues, but less optimal for live search dashboards.6 |
| **Fixed Window** | Limits requests within static time blocks (e.g., max 120 requests per minute).5 | Very simple to configure and execute on basic web servers.6 | Traffic spikes near window boundaries can overload servers.6 | Used by default on the upstream Speedrun.com API.5 |
| **Sliding Window Log** | Tracks timestamps for every user request, using a rolling window to evaluate limits.6 | Highly precise; completely prevents boundary traffic spikes.6 | Requires significant memory to store request timestamps for every user.6 | Excellent for tracking and limiting aggressive clients.6 |

To remain compliant with these rate limits while providing sub-second load times for users, the platform must use a serverless edge-caching layer.5 By caching frequently requested resources (such as active RSG leaderboards and verification queues), the platform avoids querying the Speedrun.com API for every single page load.2  
Additionally, building trust with the community requires absolute transparency regarding where the data comes from and how fresh it is. This can be achieved by placing a clear disclaimer banner at the top of the interface, accompanied by real-time status indicators. This banner should be designed using high-contrast, readable typography to ensure clarity.8

┌────────────────────────────────────────────────────────────────────────────────────────┐  
│  ⚠️ UNOFFICIAL COMMUNITY PORTAL \- DATA STATUS                                          │  
│  This platform is an independent utility powered by the Speedrun.com API.        │  
│  Leaderboards and unverified queues are cached locally to bypass the 120 requests/min   │  
│  rate limit and ensure sub-second response times.                              │  
│                                                                                        │  
│  Data Freshness: Synchronized 4 minutes ago  |  API Connection: Healthy                │  
└────────────────────────────────────────────────────────────────────────────────────────┘

The HTML markup below demonstrates how to implement this banner at the top of the viewport to establish trust with both runners and moderators.3

HTML  
\<header class\="transparency-banner-container" role\="banner" aria-label\="Data Integrity and Transparency Status"\>  
    \<div class\="transparency-banner-content"\>  
        \<div class\="banner-badge-group"\>  
            \<span class\="badge-pill badge-warning" aria-label\="Disclaimer"\>Unofficial Community Portal\</span\>  
            \<span class\="badge-pill badge-success" id\="upstream-api-status" aria-label\="API Status"\>API Operational\</span\>  
        \</div\>  
        \<p class\="banner-legal-copy"\>  
            This site is an independent tracking dashboard powered by the public Speedrun.com REST API.   
            Run data, verified states, and timing matrices are synced via our edge cache to ensure high-speed   
            browsing while staying compliant with the official 120 requests/minute rate limits.  
        \</p\>  
        \<div class\="banner-sync-telemetry"\>  
            \<span class\="telemetry-item"\>  
                \<strong\>Upstream Cache Freshness:\</strong\> \<span id\="cache-latency-timestamp"\>Synchronized 3m ago\</span\>  
            \</span\>  
            \<span class\="telemetry-separator" aria-hidden\="true"\>|\</span\>  
            \<span class\="telemetry-item"\>  
                \<strong\>Official Rules:\</strong\>   
                \<a href\="https://www.speedrun.com/mc" target\="\_blank" rel\="noopener noreferrer" class\="banner-hyperlink"\>  
                    Minecraft Leaderboard Rules  
                \</a\>  
            \</span\>  
        \</div\>  
    \</div\>  
\</header\>

Applying the following CSS style definitions ensures the banner remains readable, high-contrast, and responsive on all devices:

CSS  
/\* Transparency Banner Styling: Add to public/style.css \*/  
.transparency-banner-container {  
    background-color: \#1a1a1a;  
    border-bottom: 2px solid \#2e2e2e;  
    padding: 1rem 1.5rem;  
    font-size: 0.9rem;  
    line-height: 1.4;  
}

.transparency-banner-content {  
    max-width: 1200px;  
    margin: 0 auto;  
    display: flex;  
    flex-direction: column;  
    gap: 0.75rem;  
}

.banner-badge-group {  
    display: flex;  
    gap: 0.5rem;  
    flex-wrap: wrap;  
}

.badge-pill {  
    padding: 4px 10px;  
    font-size: 0.75rem;  
    font-weight: 700;  
    text-transform: uppercase;  
    border-radius: 12px;  
}

.badge-warning {  
    background-color: \#e3a008;  
    color: \#111;  
}

.badge-success {  
    background-color: \#0e9f6e;  
    color: \#fff;  
}

.banner-legal-copy {  
    color: var(--text-muted); /\* Lowers visual noise while remaining readable \*/  
    margin: 0;  
}

.banner-sync-telemetry {  
    font-size: 0.8rem;  
    color: var(--text-muted);  
    display: flex;  
    gap: 0.5rem;  
    align-items: center;  
    flex-wrap: wrap;  
}

.banner-hyperlink {  
    color: var(--accent-blue);  
    text-decoration: underline;  
}

.banner-hyperlink:hover {  
    color: \#3b82f6;  
}

@media screen and (max-width: 768px) {  
   .transparency-banner-container {  
        padding: 0.75rem 1rem;  
    }  
      
   .banner-sync-telemetry {  
        flex-direction: column;  
        align-items: flex-start;  
        gap: 0.25rem;  
    }  
      
   .telemetry-separator {  
        display: none; /\* Hide vertical separator on stacked layouts \*/  
    }  
}

## **Architectural Implementation Roadmap**

To successfully implement these updates on the mcspeedrun.bond serverless infrastructure, the development process should follow a structured, file-by-file roadmap.

### **Part 1: Serverless Edge Caching Strategy (api/runs.js)**

* **Objective**: Re-engineer the API querying logic to prioritize server-side filtering and implement robust cache handling, protecting the platform from hitting the 120 requests/minute rate limit.5  
* **Execution**:  
  * Implement dynamic API request routing to retrieve filtered unverified runs directly from Speedrun.com (status=new, order\_by=verify-date, sort\_direction=desc).1  
  * Map parameters in the serverless function to parse client request variables and forward them as custom variable queries (e.g., var-5ly7776l={versionId}).2  
  * Connect Vercel KV or Redis caching to store query responses with a 5-minute TTL, shielding the upstream API from direct traffic spikes.5  
  * Set a descriptive, versioned User-Agent string to identify client requests.3  
  * Parse HTTP 429 statuses and forward the standard Retry-After header to manage rate-limit resets gracefully.5

### **Part 2: Layout Optimization (public/style.css)**

* **Objective**: Build a fully responsive, touch-friendly UI that optimizes layout performance on handheld viewports.7  
* **Execution**:  
  * Set a breakpoint at ![][image10] to swap horizontal desktop tables for vertical card-style layouts.  
  * Define CSS rules (-webkit-user-select: none;, touch-action: manipulation;) on interactive table headers and cards to eliminate double-tap delays and prevent accidental text selections.10  
  * Increase text contrast, increase font sizes, and scale touch targets to a minimum of ![][image12] to prevent misclicks on compact mobile layouts.7

### **Part 3: Touch and Gesture Enhancements (public/app.js)**

* **Objective**: Optimize touch interactions and resolve default browser behaviors like Chrome's "Touch to Search".12  
* **Execution**:  
  * Programmatically append tabindex="-1" and role="button" to copyable cells (such as world seeds and player usernames) to prevent Chrome from launching search overlays on tap.12  
  * Capture touch events on interactive elements and execute event.preventDefault() with passive listener options disabled ({ passive: false }).12  
  * Track double-taps programmatically and block gestures when consecutive taps occur within 300ms.13  
  * Add a lightweight, on-screen toast notification system to confirm successful copies to the clipboard.

### **Part 4: Trust and Transparency Integration (public/index.html)**

* **Objective**: Integrate a clear, top-positioned transparency banner to establish credibility with players and moderators.3  
* **Execution**:  
  * Place the HTML banner markup at the top of the viewport to display cache freshness, official rule links, and API connection status.3  
  * Apply high-contrast CSS rules to ensure the banner remains readable, responsive, and readable on mobile viewports.8  
  * Connect a client-side JavaScript routine to dynamically fetch and display cache freshness and update connection status metrics.

By executing this implementation roadmap across the platform's codebase, mcspeedrun.bond can resolve the primary performance and usability complaints raised by speedrunners and moderators.7 These changes transform the platform into a highly responsive, mobile-friendly tool that operates reliably within official rate limits.5

#### **المصادر التي تم الاقتباس منها**

1. GitHub \- shardlab/srcr: Full scale API wrapper for the speedrun.com API, written in Crystal., تم الوصول بتاريخ ‎مايو 30, 2026، [https://github.com/shardlab/srcr](https://github.com/shardlab/srcr)  
2. api/version1/leaderboards.md at master · speedruncomorg/api \- GitHub, تم الوصول بتاريخ ‎مايو 30, 2026، [https://github.com/speedruncomorg/api/blob/master/version1/leaderboards.md](https://github.com/speedruncomorg/api/blob/master/version1/leaderboards.md)  
3. speedruncomorg/api: REST API Documentation for speedrun.com \- GitHub, تم الوصول بتاريخ ‎مايو 30, 2026، [https://github.com/speedruncomorg/api](https://github.com/speedruncomorg/api)  
4. Help needed for Speedrun.com API related question \- Reddit, تم الوصول بتاريخ ‎مايو 30, 2026، [https://www.reddit.com/r/speedrun/comments/8hmnjo/help\_needed\_for\_speedruncom\_api\_related\_question/](https://www.reddit.com/r/speedrun/comments/8hmnjo/help_needed_for_speedruncom_api_related_question/)  
5. Rate Limits \- Runn API, تم الوصول بتاريخ ‎مايو 30, 2026، [https://developer.runn.io/docs/rate-limits](https://developer.runn.io/docs/rate-limits)  
6. Rate Limiting a REST API, تم الوصول بتاريخ ‎مايو 30, 2026، [https://restfulapi.net/rest-api-rate-limit-guidelines/](https://restfulapi.net/rest-api-rate-limit-guidelines/)  
7. I made a dumb browser game with a built in time attack mode. It would be awesome if people on this sub tried to beat my PB\! : r/speedrun \- Reddit, تم الوصول بتاريخ ‎مايو 30, 2026، [https://www.reddit.com/r/speedrun/comments/1rkzsq5/i\_made\_a\_dumb\_browser\_game\_with\_a\_built\_in\_time/](https://www.reddit.com/r/speedrun/comments/1rkzsq5/i_made_a_dumb_browser_game_with_a_built_in_time/)  
8. Does anyone else hate the speedrun.com category selection menu now? It needs fixing / reverting back to how it was \- Reddit, تم الوصول بتاريخ ‎مايو 30, 2026، [https://www.reddit.com/r/speedrun/comments/sym7iw/does\_anyone\_else\_hate\_the\_speedruncom\_category/](https://www.reddit.com/r/speedrun/comments/sym7iw/does_anyone_else_hate_the_speedruncom_category/)  
9. Games with built-in timer and splits? : r/speedrun \- Reddit, تم الوصول بتاريخ ‎مايو 30, 2026، [https://www.reddit.com/r/speedrun/comments/sdbm22/games\_with\_builtin\_timer\_and\_splits/](https://www.reddit.com/r/speedrun/comments/sdbm22/games_with_builtin_timer_and_splits/)  
10. touch-action CSS property \- MDN Web Docs, تم الوصول بتاريخ ‎مايو 30, 2026، [https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)  
11. Easy Disable Double-Tap Zoom on Mobile Browser : r/incremental\_games \- Reddit, تم الوصول بتاريخ ‎مايو 30, 2026، [https://www.reddit.com/r/incremental\_games/comments/1b3n60d/easy\_disable\_doubletap\_zoom\_on\_mobile\_browser/](https://www.reddit.com/r/incremental_games/comments/1b3n60d/easy_disable_doubletap_zoom_on_mobile_browser/)  
12. Manage the triggering of touch to search | Blog \- Chrome for Developers, تم الوصول بتاريخ ‎مايو 30, 2026، [https://developer.chrome.com/blog/tap-to-search](https://developer.chrome.com/blog/tap-to-search)  
13. Disable Pinch to Zoom CSS HTML JavaScript | Kiosk Touchscreen Guide 2026 | Digital Record Board, تم الوصول بتاريخ ‎مايو 30, 2026، [https://digitalrecordboard.com/blog/disable-pinch-zoom-css-html-js-kiosk/](https://digitalrecordboard.com/blog/disable-pinch-zoom-css-html-js-kiosk/)  
14. Add touch to your site | Articles \- web.dev, تم الوصول بتاريخ ‎مايو 30, 2026، [https://web.dev/articles/add-touch-to-your-site](https://web.dev/articles/add-touch-to-your-site)  
15. Rate Limiting | Intercom and Fin Developer Platform, تم الوصول بتاريخ ‎مايو 30, 2026، [https://developers.intercom.com/docs/references/1.3/rest-api/errors/rate-limiting](https://developers.intercom.com/docs/references/1.3/rest-api/errors/rate-limiting)  
16. API Usage Limits, Versioning, and Backward Compatibility \- Bullhorn ATS, تم الوصول بتاريخ ‎مايو 30, 2026، [https://kb.bullhorn.com/ats/Content/BHATS/Topics/understandingBHAPIUsageLimitsVersioningBackwardCompatibility.htm](https://kb.bullhorn.com/ats/Content/BHATS/Topics/understandingBHAPIUsageLimitsVersioningBackwardCompatibility.htm)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAZCAYAAABD2GxlAAABxUlEQVR4Xu2WvytGURjHH5RfUcqvQUoyGdjYRBlNBsIgE0VIZr2LLMqgbBZS+APYlMlosJDBwGiQRVl4vt1zed6v+5zXq1i8n/rWfb/f55xz7zn3nPuK/EMu2XB4ZuMvOFU1selQpbpj02NPda16C7pQ7Zp8SnVr8mOTpUyrdtg0jLOhzKk22PRolGTwbQ4MyD1i2Zr4ued/ISdJcSv5KdWqEzYDk6ozNg3o13vn1sXvN490+TwWVANsBtCun00D8nk2A3hnY+N+gKJXNg3eDICsAfrk86GtslYoq30e7ZIULXJg8DrpFD8D2ASxHCAfZNOyJUlRDQeBWtU+m4Fhid8Asic2CdRMsGlJp99jWdXLZmBM4m2RzbJJoGaVTUuhG4xlQ+Ln9ZJklRwQBR8CBYdsBnA+4hXw6BL/BpckP2s21xbUjLBpQUHWLi0Xf/AUzI5Xg1Phxfz26uDXsWmpkKRoU1UWNCPxY8eCtlkb7EF1H66xyWIz+C1WVDeqI9UoZTEw+zjIszhQnasaOAhgae0s/wptUsQsEFilHjZ/AwzUwmYB8Jfrpw9WNNjtj2wW4EqSj8Cf0SH+F4fJqbrZLFGiRJG8AwGiagO5p1zBAAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAZCAYAAADnstS2AAAAn0lEQVR4XmNgGAUUghAg3g/EElC+HRBvBeJDQCwFUwQCfEDcDcTGQPwfiBcAsTNUDkSDxODgGJSOgEqYIMlxQcXgwABKX0WXAIIkLGJgABKciib2CiqOAhihgmpo4iCxLjQxhkioBDJghorJookz3IZKIIM4LGJgcB6IzdDEnjHgUIwNgBS2owtiAzAPS6JLYAPBDCQ4IRaIJ6ILDnsAAHLkIU11oaUKAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAZCAYAAABkdu2NAAACVElEQVR4Xu2XPWhUQRSFb4gBAzEhCGKhgkKwDYGgEOxsVFAU/IcEQoKFRYI2iggaUgiC2Ag2NsZORLCxtxIUFASxEzGFRSwlkCa5h5nZvZyd+/Zt3ltB3A8OO3Pu/L2ZNzNvRXr8VX6x4fCKjX+Bn6p+Nh1OqO6xWYY51XPVZtSLqI/Gu9woXR/PVFfZjPSpTrMpYbX3s1mW9DDMvAT/FAcqkusr8U7y8d2S90uBistsKuMSYu85UIEnqltsGtKblGNDdYzNdpyV0OgIB5TXEmIXOFABtLeTTQPik2xG7qp+sNmOT5Jf+r0S/I4bLGCH5Pu6Ls1tYsUclrxfSGoM+w26ofoTvbr33nkpHuAXKY6DdvEWUGHR5PdFD7NVN3ekeICIrbBJFNVvAccxKgyTvxT9unksxe0iNsEmgTJDbHp4+++hBH+UAxXB6ZnrD+B09GIWlMFdWQoUzjXq+VW5KH676cROHDJpi1c/CwrjXmL4Ac+pxsiz6fRB8EG1S8IhleOI+AOE/9Lk1006gZXz6rdwRUJhXOZMOkXBgOq3atB4IKVnKQ+w16ZN3uIN0E72VwlXCnNG/PoNHklzhayYBdWq6mnMo/M0aBxO9rTjmcUXB66EHCiHlWTwQG9VbyRMao7Pqtts1oV9AHwvHlXtiflLEg6mBMp6BwFWYY3NkuQWojZyr+eD+PtNwj4E2K/3Y9qjaAI8ZiTs8a6RPpNwWU/FdALpk6rvqoPG98C+x1vQCV1dvXZsp/PjqmtsOuDPcacrXgv4R35Twt+pAxTr0aPHf8gW5kGXkZy2ZXsAAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABFCAYAAAD3qbryAAAFhklEQVR4Xu3dX6gtUxwH8CUk+R/lv3splAeSP+VfbkLdF6Ikou4D5V8ioisiEYpIXsSD/4UkDzxIFA/EAxElReJBkqSkvDC/9kxnzu/MmvNn73Puvvl8arX3/q7ZM7POeVirNWtmlwIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwtdtzMGB7DnYi7+ZgwBs5mKGXcjCH9s0BADA/zmvKrTkc8HBTzs3hTiDatxJbm3JfDmfg/qacnsM59W8OAIC6J5ryQpl0oN+1779sP0c5bWHTqexX6p30pTkok213y+E6u6cpv5eFtr/Tq9u/KR+2+S9NebFXF1bbvtjHkTmcUvz/am7JwQ52SlM+yyEAMG5osBGX14bytYiB0Kk5bMUxdknZlqZ8m7KNcHeZnM+xuaL1Xg5atfYdVIbbd2Cbz8pZTdk7Zd3/ryvzJs5prxwCAMNiBmioQ3+qDOerdXFT/shhT+0YkV+Vw3W23OBmaP3VWPveL/X9vZWDKdSOEY4v4/U7Sgww5/G8AGAufV2GbwZYbvCyUrGPO3PY2lKWXl7sxFq2H3O4zuJc+5dC+4Zm0MJY+6Ku1r4Y6NVm8lbjzDL+f5rXAVuI88qzjwDAgOg09+x9Pqwp/wzkaxX72ZSyp8tkvVwcJ+6ajPfnL9qilHPKxg804nhn5LD1ag5aY+2Lulr7Yobp8ZStRRzrhxz2bOSAbY+mfFQml4jDp2WyNjBmEx/oNuqJ87oshwDAUtFp5nL0oi2mMzZYGKuLQdBYfbiuLD33Wrmo/U5NzPSMHa9WV8vDWF2YxcL7OMazOezZyAHbT+3rc2XpMfPnENnQQA4A6HmoLO1IPx7IplHbV6wHq9V1lqufpcea8mcOWzHT+HwOW7VzjPbV9tepfbcT9dtymMQ2d+SwZyMHbJvb13y8XQey8H1T3s4hALBYdKK5I401bTmbRm1fsW6uVtdZrn6W4li35bB1V6nPOtbOMdoXM4Bjat/tRP2NOUxim0dy2LPSAdsxTbl2hWU5+XjXlOFzjEviL+cQAFgsOtZvBrLc4U4j9hVrm7K/y+IZqN1778PBZfnzOK4sHUzUyiHtd2riWLXnzo2dx1j7+nluX5jFJdGYpXo9hz0rHbDNyuVl6fF+bcpRKQuxnUuiADBiU5l0mFemPA/YHm3KB2Vh8NHVxYNtT27KDU25pEwGRVe0dX2xfRwri/ym9n3MsuS7BWPfueNfT/eW4dmjGGzEg3FrxtrXGWpffB67lLlSMViLWdGajR6wxTq2fLz8uRP5uTkEACZiZic6yyg/N+XCXt19bX59Wbj7sN/hPtO+xkAg1iZ1T+yvPVcr7hB8M4dlcg6xXu6vXNH6vIwvpl8P3d8lzjlehwZw2Vj74pJorX0PluFZt9Wq/d2fLJO7U2MWM+rjfZT1Fsfq/0zXCW02pJYDAKt0YlM+6X2OnxXq9GfUYnDT3SXYd3hZW8cc34kB4bybpn2zMst9zVo8dmTo/K4uk59BAwBmYHtZuGx6QfsazxYL/QfbRqd8RO9zXywuj/VmK3V2Wf4Oy3my2vbtU4YHMWsVv1Yxi9m69RDt/CqHZZIfkEMAYG1iEPZamazTeqVMZpS634CMTvfQptxcJg+6rdnclN9yOGJn68w3l9W1L2aWTsrhlIYuy86D+F9uTVk8nPmLlAEA6yDWrq12FizunFzOLGeeNlr/cnFNXDbONyDMQjwrbmgma0eKmzWGLntuywEAMHvREccC9ljYDgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPxP/QfxMiblm78PcAAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAaCAYAAACD+r1hAAAAc0lEQVR4XmNgGAWDDTAC8Tsg/o8DZyOUQhSDBDdC2TD+Y2RFyAAkeQFNLAAqjgHEGLBLFDBgF2foZcAuAfLPB3RBEFjNgF0DSGwduiAIlDNgatDFIoYCQJKgkAEBGyifEyGNCUCKpwLxdyD2QJMbBcMBAAABdR4I1vom2gAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAA+klEQVR4XmNgGCngHhAzogtSEwQD8X8g3osugQc4AjEbuiA+ALIAhon1DUitJrogLhABxFlAnMoA0bgfVRorcGOAqCUaICsm1jd7GEiwxA+I85H4uQwQzTuQxJABcrDC8HEUFVgANtfANOMDIHkDdEFswBWIy9EFgaCMAWLIBnQJKPBhIOwIOMCnEJ9vQMkclxwKsAHiRnRBJNDMADFoLroEA0R8GbogNkCMS3D5BiRmjMTnRWLDgQUQd6ELYgHdDBADpyOJmULFYCADiCWR+HAAcyEpGAa0kPjCQDwLSQ4OpBgwDSAGg1IcDMQB8SsGSHk3CkbBKBisAAAhGVEvJgMFAAAAAABJRU5ErkJggg==>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABXCAYAAAC5txliAAADkElEQVR4Xu3dv4sUZxgH8DcoihBUUghRAkoKwSqNkCJqJzYRGwt/VBEjSprUNoEgQoTExqCthcHKMilsJE0K0cImf0AIIYVFQALX6PvezLB7787czc7e7b7ufT7wsDvPzLvDbLNfZuadDQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADbJwbwBAEAZjsd6E+ttvgIAgMVbiXUjVGFNYAMAKJjABgBQOIENAKBwAhsAQOEENgCAwglsAACFE9gAAAonsAEAFE5gAwAo1J9hFNaaer5mCwAAAACYxgexnuVNAAAW71JYe1kQAIBC3QsCGwBA0QQ2AIAOzaXIj2N9G+u3WH/H+md8ozkQ2AAAWlwJVVBrQtuhur+/Xu7yKEw+kqKr/qvHbERgAwBo8Vn9moLS0bH+V3VvnuYV2PJAqSYLAChQ/iP9b0tvq/UNbOdjXe1RXzYDAADed+n5Z3lQSss/ZL1xp8JkQOqqy/WYjfQNbAAA286FWHezXgpOn2S9rSawAQB0aAtJbb2tciLWwzC6f+ppvQwAQIdjsV7lzSWXLgsvoxSAl/XYAGBb+zlsrxv2fwnzPaM4L+dCdVy/5ita7A3L+R0AwNLaLj/cp2P9HutmGH7MO/JGQZpLzH3Osn0Xhn8HAMAC9H3Q7bK4GIaHlV15oxAvY+2L9WEYhbb1pPWP8yYAQClmCWy780ZPH8V6EtaeBUuVJmDMKp31G/9bsfS+67Pz/Q/9HgAAttQsgW1P3ujhx1Dt76/6NVWaFZvqwNh2Q/0RqrNrjfR+vTB2NnSvAwAowrwDW9rXzmz55NjyLNK9aq/zZqh6Xcf4InSvAwAoQt/A1swm7VNH6jG5tv2k3kazcvv+t+t626R1bc+3S/1reRMAoCR9A1ubac+w5ftJ41Ovz2zTtrCV+z5vjLkVuvdf6uQJAIBViwxs91t6Q32eN1qkfaXn7DW+qXuNtsupAAALdz1UoWXIjM9pA9udMHom2hehmoCwWdIx9K1P6zEP6uXk6/oVAKAYh8NkkGnCS1/TBrYk/cn9/7HO5CtmcDtMHsd6tVINW/VTqJ7b1nXfHQDAe21IYAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjuHZ4QIoRtvijqAAAAAElFTkSuQmCC>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJwAAAAZCAYAAADExUcmAAAExUlEQVR4Xu2aW6itUxTHh/sl4iB35ZooIpcItZVr7pc67u0XJZIH9we5pURKKKW8yKXI7UEonFxC8qSIiMSDJElJeWH+zDH2/q+x5lp7r93pO6d95q9Ge47/nGut+X1zfHOOOb9t1ul0Opsq3xfbLIsbOfu6dWZnt2LnFLvD/w7KJcX+LfZurpjCqcW2zuJA7Gi1v5cVW+vlx0daVA63WndWseuK/VZsy5EWld+L3VLsNKvtTx+tXpUcWexJq9fLvRkUfjRsubMcbQ/L4kDw26+KP+faNaJt7ppez1WuKX8XuzlptNkpaauVwQOOWeL6Ytda/fF1o9VNzrDxgRuSeDiCPdz/UTQCstVHtJ29vL37GbS3s7hKGTzg9IbHQC41y71j7YEair2L7Sf+FVb7c6loOSgDtAe8fKf7GfLZlr4aGTTgzi92k/g3Wu3AW6IpMYhqn4y02DDQj68b2s9JA/TPvPyx+5n3ra1nji02X2zPYkeMVv0PiTnLvD4cmTmreeihSQ/WWF19jsoVVjX6QKoATBQXFjthocU4B1ltv7v7rYAjz2XlI/clNTlvtHrltG5qBNI0qG/dgKGJvt6WK6zqX2XRRq/vLykrb1pbV6jfzssXuK+wESE33KbYXVbrdeU42rWTXX/FfeWPYrcX26HYwbbYPmCTF9fzmi1u4vB/ikZOpA8vWM1PT3Qf04AjuO8W/8NiX4i/YtiJcTEZBi8uoMW5Nn5jpsEFzGIxiLPwqY0PKH6e9SBuMkwKuDesrQfct+eSxuYjoD/MkgrfRxACQYg/t1Br9qtrAQHzrfgQu3M9HfjcNWbC4GrXFPyY2RV0DTj8rcSH9RJwuUOKDkomnqqNDfpEAKn/nfgB+g9eZmPQupalctR5W7xHbLjykhl1LQOCddr3R2DNJR3Q/xGflCZ/VxxzBTyI+Gz2Mug54LAvrc7c6wWm5XuzKNxv9UefzhVW9eezODAHZsFGBzT8P8UP0F/08iPuZ5gJWroSS2AYMxTs477mxpnc18yZVuvJzzL5sx8lH/ISf5H7nEtm0DXg2MHrdWE3SP2KyB1skS8sQDtGfJ7GaeQlcynbtn5sIrdau29ZI3/LbQDteC8TuJPa6GyZmZMyS9mVVj9Dch2zyWPSJjNpKQ8iX2u9AcjX+UHygX6oRr6Nf7ZoAboG3LyUORyetLFaNuxgHspig4et/hCn0cFxrgV0dC/xhyCWiyeSngfilORDzD4Kft5hol2cNOUZq9+vfGM1v4XclyA03tJQPknqgB1tHDhT/7LUwRauayC2llR2qlnDb61M6KQF6mda2rKJmzGLBfGqCHYt9pTUDQl90IeG3RwaybiC/qD4tMnLQ15+YgadBgFHm7xJCZ9ZGl8D5j6rRxLB61bbRIDR918WqxdmuQNEIyfNR1atmfxy17R/h7imxG6cTVKQ+82Zpx6ozwQf5gtnNT124CkkX2Gm2ZCQlzDdM7OQc06CMy4S4JeK7T9atQD3hZvP4LE8LgUPGmdV5LgENcHDsUOGFIE88r1iu6Q6YMXgs+wCeZfbgpfrjME6G3+VmMeJVCdrmodzpvao1fF71jVtCwQ0/xDBLpt7e4/rnU6n0+l0Op1Op9PpdDqdTqfT2dT5D7XfiFUxJaBDAAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAZCAYAAAA14t7uAAAA7klEQVR4Xu2QsQ4BURBFRyMRiUY0GomeRkWlkUj0olIqqHVKhUYjFKLT0FH7AYlvkOj8BnPzZplM3q5d9Z7kZr17zO7LEKUY9pyXCs6g7HEbcWBnXF25Dw9y0kcw6GPCadhSc6bw4agXP21hWZAbLpp+yLmIs+AyPxmRf0948VqcJseZm85Ll9xwT3VbeU7FVZWzHwqlRu7PYzln6Hv7gbi2nDuclvz+SYHcMHYNbso1xWEtIPZtAzBw4pQ4edVXxM04S3L7TQSG75yr6bPiDpyjcbHAMIL9WgL3Fxhc2VKA69syLlE3inIpKSlJeAOXTj05zIqVhwAAAABJRU5ErkJggg==>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADUAAAAZCAYAAACRiGY9AAACK0lEQVR4Xu2WO0hcURCGx8IXKIkgikoMWESwEC1EIYUINqJFqpRJESwMWEZIoaAoEgsbG7GSQGJnI2KllYhYSAgkmCYhICmDCEGwMfPnzNk7d/bsvS5md0HuBz/s/HPuY+6cxxJlZFScL6ybBGlaxTthLbF+xtP/OGOtsSZZ56zNWLZM2CK0etW4AfEeSPxY4qbcCKI91hMVg6+sZ8YrOd+twXRQ/hdGATMqnhOvX3m2s2CQ9cuapealNZgrE0+Qe+Ea4/eZGGP2jbfMmjJe2Tli1RrvD4W7YDmgaOpi/bWzfsdGELWxRijqcA+59VeXG/Gf6WZdWpOiF8XLTLPGJbadAthE/Hj7IcbITUXf0Q1ya3NUvK1oKL1nXYh/Ld66xNCxeKlg2g1bk6IbvVNeg3gPlQewIy5KLlQYgLdivCHxUbgGHooD6PIHlUvFv2QI/3J2isD7pmJ0+amKTyn+pT3wFowHQh+hSrzVQC6Vt1T4otDDgPY71W/NG8r3iykKYP3BxzOKotANwWsK5/Q12O6xUYSw1xZbFLqEMzCUS6TQDT2hHLzn8vuRxBZMn9tMvxbxXxkfmxHWKED+s8qlklbUC9YnFWMt/VAx2CX3UBQCGsnd0x4R/lnNEldLfJgb4fCbh8evr1nlJYJFjfMiiXqKzizfIQvOph1yu+C8yXl8p7pY2+Q6iW1d4wvXRWgPCh0pFcMXda+4V0XhYP1I0fTBv4aMjIyMjDvzF5lCrRCRrLotAAAAAElFTkSuQmCC>

[image11]: <data:image/png;base64,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>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG8AAAAZCAYAAAA/vnC8AAACdElEQVR4Xu2YTYiOURTHD6MQko+FsZmNsiJhMRulxIKaZogsLCgL2fhYEDZTdkqRFAspWSlMM9FsxyxGURZKtkqShWykbDj/uef2nOc899F9Mj7OO/dX/957/+e8z3POnefjvkNUKBQKhTlgP+uHNZmVFPwLrLMyHqhl9Aau+0dRqeJzPe+47f816w01i9rKemc8gLyN1nSM2/5R4DHWW2oWv0m8QePbvL/FAWsYllgjA0/9N/gun6niQXycPJX5I9aJKkx9rM1ULexi1pBorsFCT1lTwHmnrZmBp/5rTLKWyrit+OVUNQBdrofpoYp9Zu1mLWTNiLdC8o6y7qvcc+LHORbxiHi/YhfrjvGWsT4YLweP/c+ylnVFzduKX0PBvyGf0HgtIxSS+m7M1+AqhbdB5l8oXK1dwALdkjEWH4vWFc/9Nw6aKn6B8fplDulHR9xCW6KPgjW3xb/I2mFiuQyzrrG+2kAmtl43/Y+y1hkvVTxu/b3GA7GByCkzj2yj4B+2AWoeoyv4/YVHJR5FXRklx/3fZN0zigfD+JLkYb5axppByiv+OAV/iw0w3yjEzthABnjHfZLxTtbdKpSF9/4bxOI1Lync4hbc7vpqaiv+PaX9uMPbTiGOuygXvOM+Gm8PhXfS7+Cl/ySp4gG8k2o+Qs3Fi8W/UB6uXnjrlQees66r+TMKeYuU1wb+cG27yn2sq9bsgIf+G0xQVXjU41pG2MK+Yj1hHTQxoK+88xQ2EWNVeJZJqp8DrDJeavE0qf92aFAHNhld8NT/H+E0/aMT/ye47r/td858wW3/eqf2gHWoHu555nv/hUKhUCgUCoWe4SddKCdpXfRfUwAAAABJRU5ErkJggg==>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABFCAYAAAD3qbryAAADl0lEQVR4Xu3dTahuUxgH8EUiHxERiQlJDHzmY0AxkZGJgUx0U/I5UTKg1I2Rr1IoSmKAMmDIAIWiDEgpJkpKMjAwMeR5Wntf66zz3rvf495z9j7n/H717+z1rP2es84ZPa13v+uUAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwF5yR+TdvggAwHL8M2Qdt0ZO7Iu7xHGlNqdLcVdfAABY5c7IV6U2bNnQTMn7LuuLu8TnZf3GdLs9VZazFgBgwU6I/D5c/1qmG4gny/Q9S5Zrf7AvziTX4m1oAGDSt5EzhuvTSm0ibjk0u1nO/9EXd4n8PXP9J/UTM8m1XN0XAQB64+7a6HDPsj0cebvUuc+G60c23LFsud6fSl1/Xmfmkj/7i7KMtQAAC5fPq53V1f4stZG4oauPcm4nP3AwNpDrZEre81dfnMl3Zb01AwD73OEahiM1QH394m68ZLn2a/riTHIt9/fFo3Rp5JfIyf0EALA73RQ52BcHT5faULzR1W+OvNPVXu3GS9Y3m//XfWvknkN3r5ZrOZY7lRdGLij1+2rYAGCPmGpeVu2yfRC5thmfXjbfc6z1jdCRMqVd60XN9RzatZzTXB8tDRsA7BE3Rp7ti53nyuZmrB0/ELlqqOXXTMqjQa6MXB/5e6hdEfk58nXk7FJ36V4Y5nbKdZH3m3Gu7fLIW5HnS93teqyZ3075KdXxb5Pyb/hh5O7IQ5FHSz3uI3c0t0rDBgB7xLh7tm5Gr5TaTORzUuPRGO18L5uQ0YHIS804X7fTR1r8Fnkm8l7kzMi9pR5eO3qtud5u+ftng/jDMM71vBm5bRi/WKbfVl0lv6+GDQDYYGzYcucsvRz5vtS3TtuGLZuPvmHLHaU55Xly2SilbHLOb+bm0Da/eb3Of53o5etO6YsAwP42Nhlj89U2HR+X+uGGtKphO74Zz6HfPUy5yzWXvmFLuQu4Ffm6U/siALC/5WG0eWbbl8M4G4bcbTuv1ANhnxjq2bD9WGoz8U3k8aE+p7ZByufb5jwI+JLIJ83408jrzXjKueW/ZwpvL/W/VgAAbMmBsnGHDQCABcndn3yI/qN+AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANg5/wLqXqn4OSEEHgAAAABJRU5ErkJggg==>

[image14]: <data:image/png;base64,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>