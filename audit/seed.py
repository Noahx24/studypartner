import httpx, sys, json, datetime

BASE = "http://127.0.0.1:8000"
c = httpx.Client(base_url=BASE, timeout=60)

# login (user already registered)
r = c.post("/users/login", json={"email": "test.student@example.com", "password": "Audit-Pass-2026!"})
r.raise_for_status()
tok = r.json()["token"]
uid = r.json()["user_id"]
c.headers["Authorization"] = f"Bearer {tok}"

# set availability (onboarding equivalent)
r = c.patch(f"/users/{uid}", json={"hours_per_day": 4, "days_per_week": 5})
print("patch user:", r.status_code, r.text[:200])

modules = [
    ("cos2611", "COS2611 Programming: Data Structures", "semester"),
    ("inf3705", "INF3705 Advanced Systems Development", "semester"),
    ("mnb1601", "MNB1601 Business Management IB", "year"),
]
for mid, name, mtype in modules:
    r = c.post("/modules", json={"id": mid, "user_id": uid, "name": name, "module_type": mtype})
    print("module", mid, r.status_code, r.text[:120])

content = {
"cos2611": """Learning Unit 1: Introduction to Data Structures
1.1 Abstract data types
An abstract data type defines a logical model for data and the operations permitted on it. Arrays, lists, stacks and queues are the foundational structures every programmer must master. We study how memory layout affects performance and why contiguous storage favours iteration.
1.2 Big-O notation
Asymptotic analysis lets us compare algorithms independently of hardware. We cover constant, logarithmic, linear, linearithmic and quadratic growth, with worked examples from searching and sorting.
1.3 Arrays and linked lists
Static arrays trade flexibility for speed; linked lists trade locality for cheap insertion. We implement both in C++ and benchmark traversal, insertion and deletion.

Learning Unit 2: Stacks and Queues
2.1 Stack operations and applications
Push, pop and peek underpin expression evaluation, undo facilities and call stacks. We implement an array-backed and a linked stack and convert infix expressions to postfix.
2.2 Queue variants
Simple queues, circular buffers and double-ended queues each suit different producer-consumer workloads. We simulate a printer spooler to compare them.
2.3 Priority queues and heaps
Binary heaps give logarithmic insertion and removal of the extremum. We build a min-heap and use it for task scheduling.

Learning Unit 3: Trees and Graphs
3.1 Binary search trees
Ordered insertion gives logarithmic search when balanced. We implement insert, find and delete, and demonstrate degeneration to a linked list on sorted input.
3.2 Tree balancing
AVL rotations restore the height invariant after insertions and deletions. We trace single and double rotations on paper and in code.
3.3 Graph traversal
Breadth-first and depth-first search solve reachability, shortest hops and cycle detection. We model a campus map and find routes between buildings.
""",
"inf3705": """Learning Unit 1: Software Process Models
1.1 Waterfall and incremental models
Plan-driven development fixes scope early and suits stable requirements. We contrast it with incremental delivery and identify the risks each model mitigates.
1.2 Agile methods
Scrum and XP shorten feedback loops through timeboxed iterations, stand-ups and continuous integration. We map Scrum roles onto a typical UNISA group project.
1.3 Process selection
Choosing a process is a risk decision: regulatory weight, team distribution and requirement volatility all push the choice. We build a selection matrix.

Learning Unit 2: Requirements Engineering
2.1 Elicitation techniques
Interviews, workshops, ethnography and prototyping each uncover different requirement classes. We practise writing user stories with acceptance criteria.
2.2 Specification and validation
Requirements must be unambiguous, verifiable and traceable. We review a sample SRS and log its defects.

Learning Unit 3: Architectural Design
3.1 Architectural views and patterns
Layered, client-server, pipe-and-filter and microservice styles trade coupling against operational complexity. We document a system with the 4+1 view model.
3.2 Design quality attributes
Performance, security, availability and modifiability shape architecture more than functional requirements. We run an ATAM-lite trade-off analysis on a case study.
""",
}

for mid, text in content.items():
    name = dict([(m[0], m[1]) for m in modules])[mid]
    r = c.post("/upload", data={
        "user_id": uid, "module_id": mid, "module_name": name,
        "module_type": "semester", "pasted_text": text,
    })
    print("upload", mid, r.status_code, r.text[:200])

today = datetime.date(2026, 6, 12)
assessments = [
    ("a1", "cos2611", "Assignment 2: Trees and Graphs", today + datetime.timedelta(days=9)),
    ("a2", "cos2611", "Examination: COS2611", today + datetime.timedelta(days=32)),
    ("a3", "inf3705", "Assignment 1: Requirements Specification", today + datetime.timedelta(days=15)),
    ("a4", "mnb1601", "Assignment 3: Business Plan", today + datetime.timedelta(days=21)),
]
for aid, mid, title, due in assessments:
    r = c.post("/assessments", json={"id": aid, "module_id": mid, "title": title, "due_date": due.isoformat(), "weight": 20})
    print("assessment", aid, r.status_code, r.text[:120])

r = c.post("/plans/generate", json={"user_id": uid, "start_date": today.isoformat()})
print("plan:", r.status_code, str(r.json())[:300])

# complete one session + feedback so pacing has data
plan = c.get(f"/plans/daily/{uid}/{today.isoformat()}").json()
print("today sessions:", len(plan.get("sessions", [])))
if plan.get("sessions"):
    s = plan["sessions"][0]
    r = c.post(f"/plans/sessions/{s['id']}/complete", json={})
    print("complete:", r.status_code, r.text[:120])
    r = c.post("/plans/session/feedback", json={"user_id": uid, "session_id": s["id"], "actual_time_minutes": 55})
    print("feedback:", r.status_code, r.text[:120])
    # miss one session so catch-up screen has data
    if len(plan["sessions"]) > 1:
        s2 = plan["sessions"][1]
        r = c.post(f"/plans/sessions/{s2['id']}/miss", json={})
        print("miss:", r.status_code, r.text[:120])
print("USER:", uid)
