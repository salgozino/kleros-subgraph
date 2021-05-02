# Klerosboard Graph
This is the repo where you could find the backend of klerosboard. The aim of this graph deployed in thegrap.com is to track the evolution and transactions in the Kleros Courts.

## Content
### Global counters
The graph have global counters to track different properties and metrics of interest of all the courts. This counters are:
* Total disputes raised
* Total disputes on voting phase
* Total disputes on evidence phase
* Total disputes on appeal phase
* Total disputes closed
* Current Active jurors (wallets)
* Total jurors drawn
* PNK staked in the courts
* Total ETH distributed as fees
* Total PNK redistributed within jurors
* Total USD passed through the contract (in deposits and jurors fees).
### Court
Each court is an entity, where different metrics are stored.
* Number of Disputes raised in this court
* Number of Disputes already closed
* Number of Disputes ongoing
* List of all the disputes¨
* List of all the jurors (considering the child courts)
* Court childs
* Court parent
* Number of Active Jurors (considering all the court childs)
* PNK Staked (considering all the court childs).
* Fee for Jurors
* Time periods (amount of seconds for each period)
* alpha
* Min Stake (PNK)
* Fees already paid
* PNK redistributed
* policy
### Dispute
Each dispute entity has it own metrics and data.
* Dispute Number (ID)
* Arbitrable (The SC who raise the dispute)
* Creator (wallet who raise the dispute)
* Number of choices
* Metaevidence (metaevidence of the dispute. Question, options)
* Last period change
* ruled
* Rounds
* Current Rulling
* Jurors involved
### Round
Each round is an entity
* Dispute ID
* Votes
* Round rulling
* Round start time
### Vote
Each vote has it's own entity
* Dispute ID
* Round ID
* voteID
* Juror
* Choice
### Juror/Challenger
* ID (address)
* subcourts id where staked
* total staked
* active juror  (if has PNK staked or not)
* disputes as juror
* Number of disputes as juror
* disputes created
* Number of disputes created
* votes (list of all the votes)

## Other entities related to the SC events, and used as auxiliaries
### setStake
* juror address
* subcourt
* stake amount
* newtotalStakeAmount
### NewPeriod
* disputeID
* newPeriod
### draw
* address
* disputeID
* roundNumber
* voteID
### TokenAndETHShift
* address
* disputeID
* tokenAmount
* ETHAmount

## Smart Contracts
All the tracking of this grpah will be done checking the events of the KlerosLiquid smart contract, and the Policy Registry contract.
Kleros Liquid SC is deployed at [0x988b...8069](etherscan.com/address/0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069)
PolicyRegistry is deployed at [0xCf1f...ECe4](etherscan.com/address/0xCf1f07713d5193FaE5c1653C9f61953D048BECe4).
#### Kleros Liquid events of interest:
* setStake (when a juror stake pnk in some court). This event returns the current stake and the total current stake (total is the stake of the juror in all the subcourts).
* newPeriod (when a dispute changes to a new period). The posible phases are: {0:evidence, 1:commit, 2:vote, 3:appeal, 4:execution}
* draw (emitted when a jurors is drawn in a case).
* TokenAndETHShift (emmited when a juror win or lose tokens and ETH from the case)
#### KlerosLiquid functions calls of interest:
* createSubcourt
Besides is not the best performance to track functions calls, is the only way to track the creation of a new subcourt.
#### PolicyRegistry events of interest:
* PolicyUpdate (emitted when a policy is updated). Has the subcourtID and the policy



