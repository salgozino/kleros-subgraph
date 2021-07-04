import {
    Address,
    BigInt2,
    Block,
    StakeSetEvent,
    DrawEvent,
    Transaction,
    DisputeCreationEvent,
    Bytes,
    AppealDecisionEvent
} from "./mocks";

export interface DuneEventTx  {
    contract_address: string
    evt_tx_hash: string
    evt_index: number
    evt_block_time: string
    evt_block_number: number
    kleros_evt_type?: string
}

export interface DuneStakeSetEventTx extends DuneEventTx {
    _address: string
    _subcourtID: number
    _stake: number
    _newTotalStake: number
}

export interface DuneDrawEventTx extends DuneEventTx {
    _address: string
    _disputeID: number
    _appeal: number
    _voteID: number
}

export interface DuneDisputeCreationEventTx extends DuneEventTx {
    _arbitrable: string
    _disputeID: number
    tx_from: string
}

export interface DuneAppealDecisionEventTx extends DuneEventTx {
    _arbitrable: string
    _disputeID: number
}

export function StakeSetEventFromTxEvent(event: DuneStakeSetEventTx): StakeSetEvent {
    const stakeSetEvent = new StakeSetEvent();
    stakeSetEvent.address = Address.fromString(event._address)
    stakeSetEvent.logIndex = BigInt2.fromI32(0)
    stakeSetEvent.transactionLogIndex = BigInt2.fromI32(0)
    stakeSetEvent.logType = null

    stakeSetEvent.params = {
        '_address': Address.fromString(event._address),
        '_subcourtID': BigInt2.fromI32(event._subcourtID),
        '_stake': BigInt2.fromI32(event._stake),
        '_newTotalStake': BigInt2.fromI32(event._newTotalStake),
    }

    stakeSetEvent.block = new Block(BigInt2.fromI32(/*event.evt_block_time*/ 0), BigInt2.fromI32(event.evt_block_number))

    stakeSetEvent.transaction = new Transaction(event.evt_tx_hash, '')

    return stakeSetEvent
}

export function DrawEventFromTxEvent(event: DuneDrawEventTx): DrawEvent {
    const drawEvent = new DrawEvent();
    drawEvent.address = Address.fromString(event._address)
    drawEvent.logIndex = BigInt2.fromI32(0)
    drawEvent.transactionLogIndex = BigInt2.fromI32(0)
    drawEvent.logType = null

    drawEvent.params = {
        '_address': Address.fromString(event._address),
        '_disputeID': BigInt2.fromI32(event._disputeID),
        '_appeal': BigInt2.fromI32(event._appeal),
        '_voteID': BigInt2.fromI32(event._voteID),
    }

    drawEvent.block = new Block(BigInt2.fromI32(/*event.evt_block_time*/ 0), BigInt2.fromI32(event.evt_block_number))

    drawEvent.transaction = new Transaction(event.evt_tx_hash, '')

    return drawEvent
}

export function DisputeCreationEventFromTxEvent(event: DuneDisputeCreationEventTx): DisputeCreationEvent {
    const disputeCreationEvent = new DisputeCreationEvent();
    disputeCreationEvent.address = Address.fromString(event.contract_address)
    disputeCreationEvent.logIndex = BigInt2.fromI32(0)
    disputeCreationEvent.transactionLogIndex = BigInt2.fromI32(0)
    disputeCreationEvent.logType = null

    disputeCreationEvent.params = {
        '_arbitrable': new Bytes(event._arbitrable),
        '_disputeID': BigInt2.fromI32(event._disputeID),
    }

    disputeCreationEvent.block = new Block(BigInt2.fromI32(/*event.evt_block_time*/ 0), BigInt2.fromI32(event.evt_block_number))

    disputeCreationEvent.transaction = new Transaction(event.evt_tx_hash, event.tx_from)

    return disputeCreationEvent
}

export function AppealDecisionEventFromTxEvent(event: DuneAppealDecisionEventTx): AppealDecisionEvent {
    const appealDecisionEvent = new AppealDecisionEvent();
    appealDecisionEvent.address = Address.fromString(event.contract_address)
    appealDecisionEvent.logIndex = BigInt2.fromI32(0)
    appealDecisionEvent.transactionLogIndex = BigInt2.fromI32(0)
    appealDecisionEvent.logType = null

    appealDecisionEvent.params = {
        '_disputeID': BigInt2.fromI32(event._disputeID),
    }

    appealDecisionEvent.block = new Block(BigInt2.fromI32(/*event.evt_block_time*/ 0), BigInt2.fromI32(event.evt_block_number))

    appealDecisionEvent.transaction = new Transaction(event.evt_tx_hash, '')

    return appealDecisionEvent
}
