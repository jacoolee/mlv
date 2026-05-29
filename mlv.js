const MSG_SEPARATOR_REGEXP = /^From [^ ]*( at [^ ]*)? *[A-z]{3} [A-z]{3} [ 0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4}/

let gTime = Date.now()
let gLines = [ /* line, ... */ ]
let gMsgIds = [ /* MessageId, ... */ ] // ordered by time
let gMsgMap = { /* MessageId: block */ }
let gMsgSameMap = { /*MessageId: [ lidx, ... ]*/ }
let gReplyMap = { /* msgId: [msgId, ...] */ }
let gIsReplyMap = { /* msgId: true/false */} // msgId is a reply or not
let gRenderedMap = { /* msgId: true/false */} // whether rendered or not
let gMsgIdsRendered = [ /* msgId, ... */ ]
let gCurHiParentMsgId = null
let gCurHiMsgId = null

function loadTextFile(filePath, onLoaded=(text)=>{}) {
    fetch(filePath).then((response) => {
        response.text().then(onLoaded)
    })
}

function parse(text='') {
    gLines = text.split('\n')
    var idx = 0, l = null, block = {}, blockIdx = 0

    while(idx<gLines.length) {
        l = gLines[idx]

        if (l.match(MSG_SEPARATOR_REGEXP)) {
            block.blockIdx = ++blockIdx
            block.separator = l
            block.beginLidx = idx
        } else {
            console.warn('mlv: not match', idx, l)
        }

        let pk = null
        while ((l = gLines[++idx]) !== '') {
            let cidx = 0, k = null, v = null

            const commanIdx = l.indexOf(':')
            k = l.substring(0, commanIdx)
            v = l.substring(commanIdx+2)

            switch(k) {
            case 'From': {
                block['from'] = v
                let m = v.match(/\(.* via TUHS\)/)
                block['fromShort'] = m&&m.length? m[0]: ''
                break
            }
            case 'Date': {
                block['date'] = v
                break
            }
            case 'Subject': {
                block['subject'] = v
                break
            }
            case 'Message-ID': {
                block['messageId'] = v
                break
            }
            case 'In-Reply-To': {
                block['inReplyTo'] = v
                break
            }

            case 'References': {
                // block['references'] = [v] // useless for mlv
                break
            }

            default: {
                switch (pk) {
                case 'Subject': {
                    block['subject'] = block['subject']+v
                    break
                }
                case 'In-Reply-To': {
                    block['inReplyTo'] = block['inReplyTo']+v
                    break
                }

                case 'References': {
                    // block['references'].push(v) // useless for mlv
                    break
                }

                default: {
                    console.warn('mlv: unsupported pk:', pk, v, idx)
                    break
                }
                }
                break
            }
            }

            if (k){
                pk = k
            }
        }

        if (block.hasOwnProperty('inReplyTo')) {
            const x = block.inReplyTo.match(/<[^>]*>/)
            if (x) {
                block.inReplyToMailAddress = x[0]
            } else {
                console.warn(
                    'mlv: inReplyToMailAddress not found in',
                    'block.inReplyTo:', block.inReplyTo,
                    'block:', block
                )
            }
        }

        // now, ignore header/body separator and go on
        l = gLines[++idx]
        block.bodyBeginLidx = idx
        while (!l.match(MSG_SEPARATOR_REGEXP)) {
            l = gLines[++idx]
            if (l === undefined) { // end
                break
            }
        }
        block.bodyEndLidx = idx-2

        // process message bloch which has same message Id
        if (block.messageId in gMsgMap) {
            console.warn('mlv: Message-ID same occurs', block.beginLidx, gLines[block.beginLidx])
            const id = block.messageId

            if (!(id in gMsgSameMap)) {
                gMsgSameMap[id] = [gMsgMap[id].beginLidx]
            }
            gMsgSameMap[id].push(block.beginLidx)

            const mmid = block.messageId + '$' + (gMsgSameMap[id][gMsgSameMap[id].length-1]+1)
            block.messageIdModified = mmid
        }

        if (block.messageIdModified) {
            gMsgMap[block.messageIdModified] = block
            gMsgIds.push(block.messageIdModified)
        } else {
            gMsgMap[block.messageId] = block
            gMsgIds.push(block.messageId)
        }

        // self-made reply chain, same effect as references
        if (block.hasOwnProperty('inReplyToMailAddress')) {
            if (gReplyMap.hasOwnProperty(block.inReplyToMailAddress)) {
                gReplyMap[block.inReplyToMailAddress].push(block.messageId)
            } else {
                gReplyMap[block.inReplyToMailAddress] = [block.messageId]
            }
        }

        gIsReplyMap[block.messageId] = block.hasOwnProperty('inReplyTo')? true: false

        block = {}
    }
}

function showMsg(msgId) {
    const block = gMsgMap[msgId]
    if (!block) return

    const parentMsgId = block.inReplyToMailAddress || block.inReplyTo
    let e = null

    if (parentMsgId) {
        if (gCurHiParentMsgId) {
            e = document.getElementById(gCurHiParentMsgId)
            if (e) e.setAttribute('style','')
        }
        e = document.getElementById(parentMsgId)
        if (e) e.setAttribute('style', 'background-color: goldenrod;')
        gCurHiParentMsgId = parentMsgId
    } else {
        if (gCurHiParentMsgId) {
            e = document.getElementById(gCurHiParentMsgId)
            if (e) e.setAttribute('style','')
        }
    }

    if (gCurHiMsgId) {
        if (gCurHiMsgId !== gCurHiParentMsgId) {
            e = document.getElementById(gCurHiMsgId)
            if (e) e.setAttribute('style','')
        }
    }

    e = document.getElementById(msgId)
    e.setAttribute('style', 'background-color: lightgreen;')
    if (!isVisibleInContainer(e, document.getElementById('mailhead'))) {
        e.scrollIntoView()
    }
    gCurHiMsgId = msgId

    renderMsgBody(msgId)
}

function isVisibleInContainer(el, container) {
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    return elRect.top < containerRect.bottom - 30
        && elRect.bottom > containerRect.top + 30
}

function renderMsgTreeItem(msgId, level=0, marker='') {
    // NOTE: using @msgId in whole process, do not use block.messageId
    gMsgIdsRendered.push(msgId)
    gRenderedMap[msgId] = true
    const currMsgIdxRendered = gMsgIdsRendered.length-1

    const block = gMsgMap[msgId]
    if (!block) {
        console.error('mlv: no block found by msgId:', msgId)
        return
    }

    const {from, fromShort, subject, date, beginLidx, bodyEndLidx} = block

    let div = document.createElement('div')
    div.setAttribute('class', 'msgtree-item')
    div.setAttribute('id', msgId)
    div.setAttribute('ridx', currMsgIdxRendered)

    let span1 = document.createElement('span')
    const span1Text = `${marker? marker:''} ${' '.repeat(level)}${level>0?'↳ ':''}`
    span1.innerText = `${span1Text}`
    span1.setAttribute('class', 'msgtree-item--left')
    div.appendChild(span1)

    let span2 = document.createElement('span')
    const span2Text = `${subject} <${date}> ${fromShort||from} ${msgId} <${beginLidx+1},${bodyEndLidx+1} ${currMsgIdxRendered+1}/${gMsgIds.length}>`
    span2.innerText = span2Text
    span2.setAttribute('class', 'msgtree-item--right')
    div.appendChild(span2)

    // console.log(span1Text+span2Text)

    div.onclick = function() { showMsg(msgId) }
    document.getElementById('mailhead').appendChild(div)
}

function renderMsgBody(msgId) {
    const block = gMsgMap[msgId]
    const {messageIdModified, messageId, from, fromShort, subject, date, inReplyToMailAddress, inReplyTo, beginLidx, bodyBeginLidx, bodyEndLidx} = block
    const parentMsgId = inReplyToMailAddress || inReplyTo || '<None>'
    const parentBlock = gMsgMap[parentMsgId]

    const replyTo = parentBlock
          ? (parentBlock.fromShort?parentBlock.fromShort.substring(1,parentBlock.fromShort.length-1): parentBlock.from)
          : (inReplyTo || '<None>')

    let e = document.getElementById('mailbody-header')
    e.innerText = `\
Subject   : ${subject}\n\
From      : ${fromShort?fromShort.substring(1,fromShort.length-1):from}\n\
Reply To  : ${replyTo}\n\
Date      : ${date}\n\
Parent Id : ${parentMsgId}\n\
MessageId : ${messageIdModified||messageId}`

    let t = ''
    for (var i=beginLidx; i<bodyBeginLidx-1;i++) {
        t += gLines[i]+'\n'
    }
    e = document.getElementById('mailbody-header-raw')
    e.innerText = t

    t = ''
    for (var i=bodyBeginLidx; i<=bodyEndLidx;i++) {
        t += gLines[i]+'\n'
    }
    e = document.getElementById('mailbody-body--content')
    e.innerText = t
}

function _renderReplyRecursively(msgId, level=1) {
    (gReplyMap[msgId] || []).forEach((i,idx) => {
        if (!gRenderedMap[i]) {
            renderMsgTreeItem(i, level)
        }
        _renderReplyRecursively(i, level+1)
    })
}

function render() {
    for(var i of gMsgIds) {

        if (!gRenderedMap[i]) {
            renderMsgTreeItem(i, 0, gIsReplyMap[i]? '<': '*')
        }
        _renderReplyRecursively(i)

        // render messages with same message-id
        if (i in gMsgSameMap) {
            for (var j=1; j<gMsgSameMap[i].length; j++) {
                const mmid = i + '$' + String(gMsgSameMap[i][j]+1)
                if (!gRenderedMap[mmid]) {
                    renderMsgTreeItem(mmid, 0, '$')
                }
            }
        }
    }
}

function check() {
    const gMsgSameMapKeysCount = Object.keys(gMsgSameMap).length
    const gMsgSameMapValuesCount = Object.keys(gMsgSameMap).reduce((res, k, idx) => {
        res += gMsgSameMap[k].length
        return res
    }, 0)
    console.log(
        'timecost:', (Date.now() - gTime)+'ms',
        '\ngMsgIds:', gMsgIds.length,
        '\ngMsgIdsRendered:', gMsgIdsRendered.length,
        '\ngRenderedMap keys count:', Object.keys(gRenderedMap).length,
        '\ngMsgMap keys count:', Object.keys(gMsgMap).length,
        '\ngMsgSameMap keys count:', gMsgSameMapKeysCount,
        '\ngMsgSameMap values count:', gMsgSameMapValuesCount,
        '\nDuplicated message count:', gMsgSameMapValuesCount - gMsgSameMapKeysCount,
        '\nNot rendered:', gMsgIds.length - gMsgIdsRendered.length,
    )
}

function hotkeys() {
    document.addEventListener('keydown', (e) => {
        const {key, keyCode} = e
        switch(key) {
        case 'j': {
            e = document.getElementById(gCurHiMsgId)
            if (!e) return
            const idx = Number(e.getAttribute('ridx'))
            const nextMsgId = gMsgIdsRendered[idx+1]
            showMsg(nextMsgId)
            break
        }
        case 'k': {
            e = document.getElementById(gCurHiMsgId)
            if (!e) return
            const idx = Number(e.getAttribute('ridx'))
            const prevMsgId = gMsgIdsRendered[idx-1]
            showMsg(prevMsgId)
            break
        }
        case 'p': {
            if (!gCurHiParentMsgId) return
            showMsg(gCurHiParentMsgId)
            break
        }
        case 'n': {
            if (!gCurHiMsgId) return
            const replies = gReplyMap[gCurHiMsgId]
            if (!replies || replies.length === 0) return
            showMsg(replies[0])
            break
        }
        case 'h': {             // same level, prev message in message chain
            if (!gCurHiParentMsgId) return
            if (!gCurHiMsgId) return
            const replies = gReplyMap[gCurHiParentMsgId]
            const idx = replies.indexOf(gCurHiMsgId)
            if (idx === 0) return
            showMsg(replies[idx-1])
            break
        }
        case 'l': {             // same level, prev message in message chain
            if (!gCurHiParentMsgId) return
            if (!gCurHiMsgId) return
            const replies = gReplyMap[gCurHiParentMsgId]
            const idx = replies.indexOf(gCurHiMsgId)
            if (idx === replies.length-1) return
            showMsg(replies[idx+1])
            break
        }
        case 'c': {
            e = document.getElementById('c')
            let s = e.getAttribute('style')
            if (s && s.includes('block')) {
                e.setAttribute('style', '')
            } else {
                e.setAttribute('style', 'display: block;')
            }
            break
        }
        case 'm': {
            e = document.getElementById('m')
            let s = e.getAttribute('style')
            if (s && s.includes('block')) {
                e.setAttribute('style', '')
            } else {
                e.setAttribute('style', 'display: block;')
            }
            break
        }
        case '0': {
            showMsg(gMsgIdsRendered[0])
            break
        }
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8': {
            const idx = parseInt(gMsgIdsRendered.length * Number(key) / 10)
            const msgId = gMsgIdsRendered[idx]
            showMsg(msgId)
            break
        }
        case '9': {
            showMsg(gMsgIdsRendered[gMsgIdsRendered.length-1])
            break
        }
        }
    })
}

function _configure(eid, persist=false) {
    let ls_id = 'show--'+eid     // localStorage id
    let show_id = 'c-show--'+eid
    let hide_id = 'c-hide--'+eid

    const e = document.getElementById(eid)

    document.getElementById(show_id).onclick=function(_) {
        e.setAttribute('style', 'display: block;')
        persist && localStorage.setItem(ls_id, 1)
    }
    document.getElementById(hide_id).onclick=function(_) {
        e.setAttribute('style', 'display: none;')
        persist && localStorage.setItem(ls_id, 0)
    }

    // init
    if (persist) {
        if (localStorage.getItem(ls_id) === '0') {
            e.setAttribute('style', 'display: none;')
        } else {
            e.setAttribute('style', 'display: block;')
        }
    }
}

function configure() {
    _configure('c')
    _configure('m')
    _configure('mailbody-header-raw', true)
}

function manual() {
    const e = document.getElementById('m')
    e.innerText = `NAME
    mlv - maillist viewer

USAGE
    ./mlv.html?{MAIL_LIST_FILE}
    If using with local maillist file, ensure web browser's local file access ability is enabled.

EXAMPLE
    ./mlv.html?./tuhs/2026.txt

HOTKEYS
    j - view next message
    k - view previous message
    p - view parent message
    n - view child message
    h - view previous sibling message
    l - view next sibling message
    0 - view first message
    9 - view last message
    1-8 - view message at 1..8/10 percent of all messages
    c - toggle configure dialog
    m - toggle manual dialog

DIAGNOSE
    Check out ./tuhs/NOTE.txt

MARKER
    < - is a reply, but parent message is not in thread
    * - is the first message in thread (star[t])
    $ - (Same) messageId occurs before
    ↳ - sub reply
`
}

function main() {
    const qmidx = window.location.href.indexOf('?')
    const filePath = window.location.href.substring(qmidx+1)
    loadTextFile(filePath, (text) => {
        parse(text, 'From tuhs at tuhs.org')
        render()
        if (gMsgIdsRendered.length) {
            showMsg(gMsgIdsRendered[0])
        }
        hotkeys()
        configure()
        manual()
        check()
    })
}

// ################################################################
main()
