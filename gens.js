function* gen() {
    let abort = 0;
    while (abort >= 0) {
        abort = yield 'running';
    }
    return 'stopped';
}

var g = gen();
console.log(g.next(1));
console.log(g.next(2));
console.log(g.next(3));
console.log(g.next(-1));
