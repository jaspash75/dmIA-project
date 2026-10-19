"""Evidence-labelled Nilgiri landscape corridor baseline.

Corridor names, dimensions, status and reported pressures are transcribed from
MoEFCC / Project Elephant, Elephant Corridors of India (2023), pp. 130, 147-150.
The four Segur links share indicative coordinates in that report; these are NOT
precise boundaries or individual edge locations. No sightings/incidents are seeded.
"""
SEGUR_CENTER = (11.5360, 76.6521)  # indicative centroid of the four coordinates printed for Segur series

CORRIDORS = [
    {
        "id": "NIL-S01", "name": "Kallhatti–Segur at Glencorin (Segur 1)",
        "a": "Kallhatti Reserve Forest", "b": "Singara Reserve Forest",
        "state": "Tamil Nadu · Nilgiri landscape", "length_km": 23.5,
        "status_2023": "Active; elephant-use intensity stable", "movement": "Regular",
        "source_page": 147, "lat": SEGUR_CENTER[0], "lon": SEGUR_CENTER[1],
        "notes": "MoEFCC 2023 describes this as one of four links in the notified Segur Plateau Elephant Corridor series. Reported pressures across the series include high-traffic State Highway stretches, settlements at Mavanallah and Bokkapuram, a 7 km concrete flume channel from Masinagudi to Moyar, high-tension power lines, resorts and tourism infrastructure.",
        "source_type": "official_baseline", "reported_elephants_series_2023": 61,
        "width_km": 1.5, "series": "Segur Plateau series"
    },
    {
        "id": "NIL-S02", "name": "Avarahalla–Sigur (Segur 2)",
        "a": "Avarahalla Reserve Forest", "b": "Segur Reserve Forest",
        "state": "Tamil Nadu · Nilgiri landscape", "length_km": 23.5,
        "status_2023": "Active; elephant-use intensity stable", "movement": "Regular",
        "source_page": 148, "lat": SEGUR_CENTER[0], "lon": SEGUR_CENTER[1],
        "notes": "MoEFCC 2023 lists this as part of the four-corridor Segur Plateau series. The report identifies road traffic, the Masinagudi–Moyar flume channel, settlements, power lines and tourism infrastructure as corridor pressures.",
        "source_type": "official_baseline", "reported_elephants_series_2023": 61,
        "width_km": 1.5, "series": "Segur Plateau series"
    },
    {
        "id": "NIL-S03", "name": "Kalmalai–Singara and Avarahalla (Segur 3)",
        "a": "Singara Reserve Forest", "b": "Avarahalla Reserve Forest",
        "state": "Tamil Nadu · Nilgiri landscape", "length_km": 23.5,
        "status_2023": "Active; elephant-use intensity stable", "movement": "Regular",
        "source_page": 149, "lat": SEGUR_CENTER[0], "lon": SEGUR_CENTER[1],
        "notes": "The official inventory lists this named corridor within the Segur Plateau series. Graph endpoints are a simplified connectivity representation; they are not a surveyed route geometry.",
        "source_type": "official_baseline", "reported_elephants_series_2023": 61,
        "width_km": 1.5, "series": "Segur Plateau series"
    },
    {
        "id": "NIL-S04", "name": "Moyar–Avarahalla (Segur 4)",
        "a": "Moyar Reserve Forest", "b": "Avarahalla Reserve Forest",
        "state": "Tamil Nadu · Nilgiri landscape", "length_km": 23.5,
        "status_2023": "Active; elephant-use intensity stable", "movement": "Regular",
        "source_page": 150, "lat": SEGUR_CENTER[0], "lon": SEGUR_CENTER[1],
        "notes": "MoEFCC 2023 lists this as part of the Segur Plateau series and recommends securing bottleneck land, reengineering the canal/flume channel to facilitate wildlife movement and regulating tourism activity.",
        "source_type": "official_baseline", "reported_elephants_series_2023": 61,
        "width_km": 1.5, "series": "Segur Plateau series"
    },
    {
        "id": "NIL-KM", "name": "Kaniyanpura–Moyar", "a": "Kaniyanpura Reserve Forest",
        "b": "Moyar Reserve Forest", "state": "Karnataka · Bandipur / Nilgiri landscape",
        "length_km": 3.0, "status_2023": "Active; use intensity not available",
        "movement": "Regular", "source_page": 130, "lat": 11.6350, "lon": 76.6930,
        "notes": "The 2023 inventory says this 3 km × 0.4 km corridor connects Kaniyanpura RF with Moyar RF in the Bandipur Tiger Reserve landscape. It identifies the Mangala–Jakkahalli–Yelchetti road and resort emergence as pressures, and recommends formal protection and widening at the bottleneck. Coordinates shown here are an indicative centre derived from the coordinate range, not a corridor boundary.",
        "source_type": "official_baseline", "reported_elephants_series_2023": None,
        "width_km": 0.4, "series": "Kaniyanpura–Moyar"
    }
]

BASELINE_FACTS = {
    "as_of": "2023 inventory; not a current field verification",
    "focus": "Nilgiri Biosphere landscape, especially the Segur Plateau series and connected Kaniyanpura–Moyar link",
    "segur_series_elephants": {"value": 61, "year": 2023, "scope": "Forest Department estimate for all four Segur corridors together; not per corridor"},
    "segur_resorts": {"value": 38, "reported_year": 2024, "scope": "Tamil Nadu information cited by PIB on 9 December 2024 for resorts existing within the notified Segur Elephant Corridor; not a current verified count"},
    "known_pressure_points": ["Mavanallah", "Bokkapuram", "Masinagudi–Moyar flume channel", "State Highway stretches", "high-tension power lines", "tourism infrastructure"],
    "recommended_actions_from_2023_inventory": ["Secure land at crucial bottlenecks", "Reengineer the canal/flume channel to facilitate wildlife movement", "Regulate tourism activity", "Investigate reported barriers with field evidence"],
    "sources": [
        {"title": "Elephant Corridors of India 2023 (MoEFCC / Project Elephant)", "url": "https://moef.gov.in/uploads/2023/11/PE-Elephant-Corridor-of-India-2023.pdf", "note": "Corridors, dimensions, use status and pressures; pp. 130, 147–150."},
        {"title": "PIB: Parliament question on elephant corridors (9 Dec 2024)", "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2082534&lang=2&reg=48", "note": "150 corridors across 15 states; Tamil Nadu reported 38 resorts within the notified Segur corridor."},
        {"title": "WII: Regional Action Plan for Human–Elephant Conflict in South India (2026)", "url": "https://www.wii.gov.in/news/rap_for_comprehensive_understanding_management_human_elephant_conflict_in_south_india_technical_report_2026_release", "note": "Recent official regional research on conflict hotspots, fragmentation and infrastructure pressures."},
        {"title": "MoEFCC / WII: Railway collision mitigation planning (2025)", "url": "https://moef.gov.in/uploads/2025/07/Elephants_Railways_Mitigation_Planning_March_2025_Final.pdf", "note": "Indian railway stretches surveyed for wildlife collision vulnerability; includes Tamil Nadu and Coimbatore/Nilgiris stretches."}
    ]
}
