use crate::model::*;

pub struct ExampleBuilder {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub nk: NetKind,
}

impl ExampleBuilder {
    fn new(nk: NetKind) -> Self {
        ExampleBuilder { nodes: Vec::new(), edges: Vec::new(), nk }
    }
    fn place(&mut self, x: f32, y: f32, label: &str, tokens: usize) -> String {
        let mut n = create_place(x, y, self.nk);
        n.place_mut().map(|d| {
            d.label = label.into();
            d.tokens = tokens;
        });
        let id = n.id.clone();
        self.nodes.push(n);
        id
    }
    fn transition(&mut self, x: f32, y: f32, label: &str) -> String {
        let mut n = create_transition(x, y, self.nk);
        n.transition_mut().map(|d| d.label = label.into());
        let id = n.id.clone();
        self.nodes.push(n);
        id
    }
    fn link(&mut self, source: &str, target: &str, weight: usize, cvn_arc: Option<CvnArc>) {
        let mut e = create_arc(source, target, ArcType::Normal, weight);
        e.data.cvn_arc = cvn_arc;
        self.edges.push(e);
    }
    fn net(self) -> PetriNet {
        PetriNet { net_kind: self.nk, nodes: self.nodes, edges: self.edges }
    }
}

pub fn pt_example() -> PetriNet {
    let mut b = ExampleBuilder::new(NetKind::Pt);
    let a_idle = b.place(40.0, 60.0, "A idle", 1);
    let enter_a = b.transition(200.0, 60.0, "Enter A");
    let a_crit = b.place(360.0, 60.0, "A critical", 0);
    let exit_a = b.transition(520.0, 60.0, "Exit A");
    let mutex = b.place(280.0, 190.0, "Mutex", 1);
    let b_idle = b.place(40.0, 320.0, "B idle", 1);
    let enter_b = b.transition(200.0, 320.0, "Enter B");
    let b_crit = b.place(360.0, 320.0, "B critical", 0);
    let exit_b = b.transition(520.0, 320.0, "Exit B");

    b.link(&a_idle, &enter_a, 1, None);
    b.link(&mutex, &enter_a, 1, None);
    b.link(&enter_a, &a_crit, 1, None);
    b.link(&a_crit, &exit_a, 1, None);
    b.link(&exit_a, &a_idle, 1, None);
    b.link(&exit_a, &mutex, 1, None);

    b.link(&b_idle, &enter_b, 1, None);
    b.link(&mutex, &enter_b, 1, None);
    b.link(&enter_b, &b_crit, 1, None);
    b.link(&b_crit, &exit_b, 1, None);
    b.link(&exit_b, &b_idle, 1, None);
    b.link(&exit_b, &mutex, 1, None);

    b.net()
}

pub fn timed_example() -> PetriNet {
    let mut b = ExampleBuilder::new(NetKind::Timed);
    let load = b.place(60.0, 150.0, "Job ready", 1);
    let done = b.place(400.0, 150.0, "Job done", 0);

    let process = b.transition(230.0, 60.0, "Process");
    if let Some(d) = b.nodes.iter_mut().find(|n| n.id == process).and_then(|n| n.transition_mut()) {
        d.interval = Some(TimeInterval { earliest: 2.0, latest: Some(5.0), left_open: false, right_open: false });
    }
    let reset = b.transition(230.0, 260.0, "Reset");
    if let Some(d) = b.nodes.iter_mut().find(|n| n.id == reset).and_then(|n| n.transition_mut()) {
        d.interval = Some(TimeInterval { earliest: 1.0, latest: Some(3.0), left_open: false, right_open: false });
    }

    b.link(&load, &process, 1, None);
    b.link(&process, &done, 1, None);
    b.link(&done, &reset, 1, None);
    b.link(&reset, &load, 1, None);

    b.net()
}

pub fn cvn_example() -> PetriNet {
    let mut b = ExampleBuilder::new(NetKind::Cvn);
    let t1_ready = b.place(60.0, 60.0, "T1 ready", 1);
    let lock1 = b.transition(230.0, 60.0, "Lock 1");
    let t1_crit = b.place(420.0, 60.0, "T1 critical", 0);
    let unlock1 = b.transition(590.0, 60.0, "Unlock 1");
    let t2_ready = b.place(60.0, 420.0, "T2 ready", 1);
    let lock2 = b.transition(230.0, 420.0, "Lock 2");
    let t2_crit = b.place(420.0, 420.0, "T2 critical", 0);
    let unlock2 = b.transition(590.0, 420.0, "Unlock 2");
    let mutex = b.place(325.0, 240.0, "Mutex", 1);
    if let Some(d) = b.nodes.iter_mut().find(|n| n.id == mutex).and_then(|n| n.place_mut()) {
        d.cvn_place = Some(CvnPlace { class: "resource".into(), sub: None, resource: Some("Mutex".into()), param: None });
    }

    b.link(&t1_ready, &lock1, 1, Some(CvnArc { kind: "guard".into(), guard: Some("n < 2".into()), update: None }));
    b.link(&mutex, &lock1, 1, None);
    b.link(&lock1, &t1_crit, 1, None);
    b.link(&t1_crit, &unlock1, 1, None);
    b.link(&unlock1, &t1_ready, 1, Some(CvnArc { kind: "update".into(), guard: None, update: Some("n = n + 1".into()) }));
    b.link(&unlock1, &mutex, 1, None);

    b.link(&t2_ready, &lock2, 1, Some(CvnArc { kind: "guard".into(), guard: Some("n < 2".into()), update: None }));
    b.link(&mutex, &lock2, 1, None);
    b.link(&lock2, &t2_crit, 1, None);
    b.link(&t2_crit, &unlock2, 1, None);
    b.link(&unlock2, &t2_ready, 1, Some(CvnArc { kind: "update".into(), guard: None, update: Some("n = n + 1".into()) }));
    b.link(&unlock2, &mutex, 1, None);

    b.net()
}

pub fn apply_layout(net: &mut PetriNet) {
    let opts = crate::layout::LayoutOptions::default();
    let pos = crate::layout::compute_layout(&net.nodes, &net.edges, &opts);
    for n in net.nodes.iter_mut() {
        if let Some(p) = pos.get(&n.id) {
            n.position = p.clone();
        }
    }
}