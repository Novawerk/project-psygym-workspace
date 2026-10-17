import json, re, sys, unicodedata, glob
sys.path.insert(0, '.')
def nz(s): return [c for c in unicodedata.normalize('NFKC', s) if not re.match(r'[\s\W_]', c)]
NUM={'1':'one','10':'ten','4':'four'}
def ne(s): return [NUM.get(w,w) for w in re.sub(r"[^a-z0-9' ]", ' ', s.lower().replace('▁',' ')).split()]
def ed(r,h):
    d=list(range(len(h)+1))
    for i in range(1,len(r)+1):
        p,d[0]=d[0],i
        for j in range(1,len(h)+1): p,d[j]=d[j],min(d[j]+1,d[j-1]+1,p+(r[i-1]!=h[j-1]))
    return d[len(h)]
def score(samples, lang):
    out={}
    for voice in ('Ting','Reed','Sama'):
        E=N=0
        for stem,ref,hyp in samples:
            if not stem.endswith(voice): continue
            f=nz if lang=='zh' else ne
            E+=ed(f(ref),f(hyp)); N+=len(f(ref))
        if N: out[voice]=round(100*E/N,1)
    return out
if __name__=='__main__':
    for f in sorted(glob.glob('out/*.json')):
        d=json.load(open(f)); print(d['model'], {l:score(x['samples'],l) for l,x in d['langs'].items()})
