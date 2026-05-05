export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }) {
    const p = {
        fill: 'none',
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
    };
    const paths = {
        home: <path {...p} d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-4v-6h-8v6H4a1 1 0 0 1-1-1v-9.5z"/>,
        today: (<>
        <rect {...p} x="4" y="5" width="16" height="16" rx="2"/>
        <path {...p} d="M4 9h16M8 3v4M16 3v4"/>
        <circle cx="12" cy="14" r="1.6" fill={color} stroke="none"/>
      </>),
        week: (<>
        <rect {...p} x="3" y="5" width="18" height="16" rx="2"/>
        <path {...p} d="M3 10h18M8 3v4M16 3v4"/>
      </>),
        calendar: (<>
        <rect {...p} x="3" y="5" width="18" height="16" rx="2"/>
        <path {...p} d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2M15 17h2"/>
      </>),
        modules: (<>
        <rect {...p} x="3" y="4" width="8" height="7" rx="1.5"/>
        <rect {...p} x="13" y="4" width="8" height="7" rx="1.5"/>
        <rect {...p} x="3" y="13" width="8" height="7" rx="1.5"/>
        <rect {...p} x="13" y="13" width="8" height="7" rx="1.5"/>
      </>),
        plus: <path {...p} d="M12 5v14M5 12h14"/>,
        settings: (<>
        <circle {...p} cx="12" cy="12" r="3"/>
        <path {...p} d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
      </>),
        check: <path {...p} d="M5 12l5 5 10-11"/>,
        checkCircle: (<>
        <circle {...p} cx="12" cy="12" r="9"/>
        <path {...p} d="M8 12.5l3 3 5-7"/>
      </>),
        circle: <circle {...p} cx="12" cy="12" r="9"/>,
        clock: (<>
        <circle {...p} cx="12" cy="12" r="9"/>
        <path {...p} d="M12 7v5l3 2"/>
      </>),
        play: <path {...p} d="M7 5v14l12-7-12-7z" fill={color}/>,
        pause: (<>
        <rect x="6" y="5" width="4" height="14" rx="1" fill={color}/>
        <rect x="14" y="5" width="4" height="14" rx="1" fill={color}/>
      </>),
        arrowRight: <path {...p} d="M5 12h14M13 6l6 6-6 6"/>,
        arrowLeft: <path {...p} d="M19 12H5M11 6l-6 6 6 6"/>,
        chevronRight: <path {...p} d="M9 6l6 6-6 6"/>,
        chevronDown: <path {...p} d="M6 9l6 6 6-6"/>,
        chevronUp: <path {...p} d="M6 15l6-6 6 6"/>,
        close: <path {...p} d="M6 6l12 12M18 6L6 18"/>,
        sparkles: (<>
        <path {...p} d="M12 3l1.8 4.8L18 9.5l-4.2 1.7L12 16l-1.8-4.8L6 9.5l4.2-1.7L12 3z"/>
        <path {...p} d="M18 15l.8 2 2 .8-2 .7L18 21l-.8-2-2-.7 2-.8.8-2z"/>
      </>),
        book: (<>
        <path {...p} d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/>
        <path {...p} d="M4 19a2 2 0 0 0 2 2h13M9 7h7M9 11h7"/>
      </>),
        video: (<>
        <rect {...p} x="3" y="6" width="13" height="12" rx="2"/>
        <path {...p} d="M16 10l5-3v10l-5-3z"/>
      </>),
        pencil: <path {...p} d="M15 4l5 5-11 11H4v-5L15 4z"/>,
        flame: <path {...p} d="M12 3s4 5 4 9a4 4 0 1 1-8 0c0-2 1-3 1-5 0 2 2 2 3 4 0-3 0-5 0-8z"/>,
        trend: <path {...p} d="M3 17l6-6 4 4 8-8M15 7h6v6"/>,
        target: (<>
        <circle {...p} cx="12" cy="12" r="9"/>
        <circle {...p} cx="12" cy="12" r="5"/>
        <circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/>
      </>),
        grip: (<>
        <circle cx="8" cy="6" r="1.3" fill={color}/><circle cx="16" cy="6" r="1.3" fill={color}/>
        <circle cx="8" cy="12" r="1.3" fill={color}/><circle cx="16" cy="12" r="1.3" fill={color}/>
        <circle cx="8" cy="18" r="1.3" fill={color}/><circle cx="16" cy="18" r="1.3" fill={color}/>
      </>),
        bell: <path {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0"/>,
        refresh: <path {...p} d="M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4"/>,
        mic: (<>
        <rect {...p} x="9" y="3" width="6" height="12" rx="3"/>
        <path {...p} d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
      </>),
        filter: <path {...p} d="M3 5h18l-7 9v5l-4 2v-7L3 5z"/>,
        search: (<>
        <circle {...p} cx="11" cy="11" r="7"/>
        <path {...p} d="M20 20l-4-4"/>
      </>),
        lightbulb: <path {...p} d="M9 18h6M10 21h4M9 15a5 5 0 1 1 6 0c-1 1-1 2-1 3h-4c0-1 0-2-1-3z"/>,
        fire: <path {...p} d="M12 2c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3 2-4 .5 2 1.5 2 2 3 0-3 1-6 1-9z"/>,
        pack: (<>
        <path {...p} d="M21 8l-9-5-9 5 9 5 9-5z"/>
        <path {...p} d="M3 12l9 5 9-5M3 16l9 5 9-5"/>
      </>),
        download: <path {...p} d="M12 3v14M6 11l6 6 6-6M4 21h16"/>,
        cloud: <path {...p} d="M7 17a5 5 0 0 1 0-10 6 6 0 0 1 11.5 2A4 4 0 0 1 17 17H7z"/>,
    };
    return (<svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, ...style }}>
      {paths[name]}
    </svg>);
}
