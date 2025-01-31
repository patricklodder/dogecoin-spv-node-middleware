const app = require('../src/app');
const assert = require('assert');
const bitcoinjs = require('bitcoinjs-lib');
const networks = require('../src/networks');
const { initKeyPair } = require('../src/util');
const { PaymentMessage, PaymentMessageType } = require('../src/api/models/payment');
const { PaymentService } = require('../src/services/paymentservice');
const bip65 = require('bip65');
const crypto = require('crypto');

const generateKeyPair = () => {
    return bitcoinjs.ECPair.makeRandom(options={
        network: networks.regtest
    });
}

const generateLockTime = (n) => {
    n.length == 0 ? n = 0 : n = 300;
    return Buffer.from(bip65.encode({ blocks: n }).toString(16), 'hex').reverse().toString('hex')
}

const constructRS = (locktime, keyPairA, keyPairB) => {
    return multisigScript = "OP_IF " + 
    locktime + "00" + " OP_CHECKLOCKTIMEVERIFY OP_DROP " +
    keyPairA.publicKey.toString('hex') + " OP_CHECKSIGVERIFY OP_ELSE OP_2 OP_ENDIF " +
    keyPairA.publicKey.toString('hex') + " " + keyPairB.publicKey.toString('hex') + " OP_2 OP_CHECKMULTISIG"
}

const generateP2SH = (multisigScript) => {
    return bitcoinjs.payments.p2sh({
        redeem: { output: bitcoinjs.script.fromASM(multisigScript) },
        network: networks.regtest
    })
}

const generateTx = (p2sh, amt) => {
    let tx = new bitcoinjs.Transaction()
    tx.addInput(Buffer.from(tx.getId(), 'hex'), 0, bitcoinjs.Transaction.DEFAULT_SEQUENCE, Buffer.from(p2sh.redeem.output.toString('hex'), 'hex'))
    tx.addOutput(Buffer.from(p2sh.redeem.output.toString('hex'), 'hex'), amt)
    return tx
}

const generatePsbtHex = (tx, p2sh, amt, p2pkh, keyPair, multisigScript) => {
    const psbt = new bitcoinjs.Psbt({ network: networks.regtest })
    psbt.addInput({
      // if hash is string, txid, if hash is Buffer, is reversed compared to txid
      hash: tx.getHash(),
      index: tx.ins[0].index,
      // non-segwit inputs now require passing the whole previous tx as Buffer
      nonWitnessUtxo: Buffer.from(tx.toHex(), 'hex'),
      redeemScript: p2pkh.output
    })
    // 100*100000000
    psbt.addOutputs([{
      script: bitcoinjs.script.fromASM('OP_HASH160 ' + p2sh.hash.toString('hex') + ' OP_EQUAL'),
      value: amt
    }])
  
    psbt.signInput(0, keyPair)
    psbt.finalizeAllInputs()
  
    const transactionMultisig = psbt.extractTransaction(true).toHex()

    let psbt2 = new bitcoinjs.Psbt({ network: networks.regtest })
    psbt2.addInput({
        hash: bitcoinjs.Transaction.fromHex(transactionMultisig).getId(),
        index: 0,
        nonWitnessUtxo: Buffer.from(transactionMultisig, 'hex'),
        redeemScript: bitcoinjs.script.fromASM(multisigScript)
    })
    return psbt2
}

const initPaymentService = (expiry) => {
    return new PaymentService(networks.regtest, expiry);
}

describe('payment service', () => {
    const keyPairA = generateKeyPair()
    const keyPairB = generateKeyPair()
    const locktime = generateLockTime(300)
    const rs = constructRS(locktime, keyPairA, keyPairB)
    const p2sh = generateP2SH(rs)
    const alice = bitcoinjs.payments.p2pkh({ pubkey: keyPairA.publicKey, network: networks.regtest })
    let tx = generateTx(p2sh, 100000000, alice, keyPairA)
    let ps = initPaymentService(1159)
    let result = ''
    it('should be a goodPsbtHex', function(done) {
        console.log(tx)
        let res = generatePsbtHex(tx, p2sh, 100000000, alice, keyPairA, rs)
        console.log(res)
        console.log(ps)
        result = ps.checkPSBT(keyPairA.publicKey.toString('hex'), res.toHex())
        console.log(result)
        done()
    })
});


