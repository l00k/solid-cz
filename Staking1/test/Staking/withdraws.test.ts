import { Coin } from '@/Coin';
import { RewardsClaimedEvent, Staking, TransferEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers, network } from 'hardhat';
import colors from 'colors';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import {
    assertErrorMessage,
    findEvent,
    getSigners,
    mineBlock,
    Signers,
    tokenFormat,
    waitForTxs
} from '../helpers/utils';



type Pool = {
    tokenIdx: number,
    amount: BigNumber,
    timespan: number,
    rewardsPerSecond: BigNumber,
};

type Staker = {
    account: SignerWithAddress,
    stake: BigNumber,
    rewards: BigNumber[],
};

type Stakers = {
    alice: Staker,
    bob: Staker,
    carol: Staker,
    dave: Staker,
};



describe('Staking / Withdraws', async() => {
    let accounts : Partial<Signers> = {};
    
    let tokenMain : Coin;
    let tokenRewards : { [i : number] : Coin } = {};
    
    let stakingContract : Staking;
    let rewardPools : { [i : number] : any } = {};
    
    let pools : Pool[] = [];
    
    let stakers : Partial<Stakers> = {};
    
    
    async function stakeTokens(stakes : { [ stakerName : string ]: BigNumber })
    {
        const txs = [];
    
        for (const [ stakerName, amount ] of Object.entries<BigNumber>(stakes)) {
            const staker = stakers[stakerName];
            
            const tx = await stakingContract
                .connect(staker.account)
                .stake(amount);
            txs.push(tx);
            
            // local info
            staker.stake = staker.stake.add(amount);
        }
        
        return txs;
    }
    
    async function checkStakers(...stakerNames: string[])
    {
        for (const stakerName of stakerNames) {
            const staker = stakers[stakerName];
        
            const stake = await stakingContract.balanceOf(staker.account.address);
            expect(stake).to.be.equal(staker.stake);
        
            const rewards = await stakingContract.rewardsOf(staker.account.address);
            for (let p = 0; p < 3; ++p) {
                expect(rewards[p].balance).to.be.equal(staker.rewards[p]);
            }
        }
    }
    
    async function checkShares(shares : { [ stakerName : string ]: number })
    {
        const totalShare = await stakingContract.totalShares();
        
        for (const [ stakerName, shareRatio ] of Object.entries<number>(shares)) {
            const staker = stakers[stakerName];
            const stakerShare = await stakingContract.stakerShare(staker.account.address)
        
            expect(
                stakerShare.mul(1000000).div(totalShare).toNumber() / 1000000
            ).to.be.equal(shareRatio);
        }
    }
    
    function addLocalRewards(ratios : { [ stakerName : string ]: number }, time : number|number[])
    {
        for (const [ stakerName, ratio ] of Object.entries<number>(ratios)) {
            const staker = stakers[stakerName];
            
            for (let p = 0; p < 3; ++p) {
                const poolTime = time instanceof Array
                    ? time[p]
                    : time;
            
                staker.rewards[p] = staker.rewards[p].add(
                    pools[p].rewardsPerSecond
                        .mul(poolTime)
                        .mul(100000000000 * ratio)
                        .div(100000000000)
                );
            }
        }
    }
    
    async function displayDetails(label : string = 'details')
    {
        const totalShares = await stakingContract.totalShares();
        const block = await ethers.provider.getBlock('latest');
        
        console.log(
            colors.red('### ' + label),
        );
        
        for (const [name, account] of Object.entries(accounts)) {
            
            const stake = await stakingContract.balanceOf(account.address);
            if (Number(stake.toString()) == 0) {
                continue;
            }
            
            console.log(colors.green(name));
            console.log("\tStake", stake.div(tokenFormat(1, 18)).toNumber());
            
            const rewards = await stakingContract.rewardsOf(account.address);
            console.log("\tRewards");
            console.log("\t\t0", rewards[0].balance.div(tokenFormat(1, 18)).toNumber());
            console.log("\t\t1", rewards[1].balance.div(tokenFormat(1, 18)).toNumber());
            console.log("\t\t2", rewards[2].balance.div(tokenFormat(1, 8)).toNumber());
            
            const share = await stakingContract.stakerShare(account.address);
            console.log(
                "\tShare",
                share.div(tokenFormat(1, 6)).toNumber(),
                (Number(share.toString()) / Number(totalShares.toString()) * 100).toFixed(1) + '%'
            );
        }
        
        console.log();
    }
    
    
    /**
     * BEFORE ALL
     */
    beforeEach(async() => {
        accounts = await getSigners();
        
        [
            tokenMain,
            tokenRewards[0],
            tokenRewards[1],
            tokenRewards[2]
        ] = await createTokens('staking', 'reward1', 'reward2', 'reward3');
        
        stakingContract = await Factory.Staking(tokenMain.address);
        
        // approves
        for (const account of Object.values(accounts)) {
            const tx = await tokenMain.connect(account).approve(
                stakingContract.address,
                tokenFormat(10000000)
            );
            await tx.wait();
        }
        
        // pools
        pools = [
            {
                tokenIdx: 0,
                amount: tokenFormat(1000000),
                timespan: 10000,
                // internal values
                rewardsPerSecond: tokenFormat(100)
            },
            {
                tokenIdx: 1,
                amount: tokenFormat(5000000),
                timespan: 20000,
                // internal values
                rewardsPerSecond: tokenFormat(250)
            },
            {
                tokenIdx: 2,
                amount: tokenFormat(50000, 8),
                timespan: 1000,
                // internal values
                rewardsPerSecond: tokenFormat(50, 8)
            },
        ];
        
        for (const pool of pools) {
            const token = tokenRewards[pool.tokenIdx];
            
            // approve reward token
            const approveTx = await token.connect(accounts.owner).approve(
                stakingContract.address,
                pool.amount
            );
            await approveTx.wait();
            
            // create pool
            const poolCreateTx = await stakingContract.connect(accounts.owner).createRewardsPool(
                token.address,
                pool.amount,
                pool.timespan
            );
            await poolCreateTx.wait();
        }
        
        // stakers
        stakers = <any> {};
        for (const name of [ 'alice', 'bob', 'carol', 'dave' ]) {
            stakers[name] = {
                account: accounts[name],
                stake: tokenFormat(0),
                rewards: [ tokenFormat(0), tokenFormat(0), tokenFormat(0) ],
            };
        };
    });
    
    afterEach(async() => {
        await network.provider.send('evm_setAutomine', [ true ]);
    });
    
    
    it('Should do nothing when requesting withdrawal without stake', async() => {
        const tx = await stakingContract.connect(accounts.alice).withdraw();
        const result = await tx.wait();
        
        expect(result.status).to.be.equal(1);
        expect(result.events.length).to.be.equal(0);
    });
    
    
    it('Properly transfer tokens while withdrawing with rewards', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Inital staking (25%, 25%, 50%)
        {
            const txs = await stakeTokens({
                alice: tokenFormat(10000),
                bob: tokenFormat(10000),
                carol: tokenFormat(20000),
            });
            await mineBlock();
            await waitForTxs(txs);
        }
        
        // Alice withdraws 50% of stake
        {
            const preContractBalances = [];
            const preAliceBalances = [];
            
            preContractBalances.push(await tokenMain.balanceOf(stakingContract.address));
            preAliceBalances.push(await tokenMain.balanceOf(accounts.alice.address));
            
            for (let t = 0; t < 3; ++t) {
                preContractBalances.push(await tokenRewards[t].balanceOf(stakingContract.address));
                preAliceBalances.push(await tokenRewards[t].balanceOf(accounts.alice.address));
            }
            
            // adjust local rewards state
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 100);
        
            // withdraw
            const tx = await stakingContract.connect(accounts.alice).withdraw();
            await mineBlock(100);
            const result = await tx.wait();
            
            // check events
            const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', 1);
            expect(eventTransfer.args.from).to.be.equal(stakingContract.address);
            expect(eventTransfer.args.to).to.be.equal(accounts.alice.address);
            expect(eventTransfer.args.value).to.be.equal(tokenFormat(10000));
            
            for (let t = 1; t < 4; ++t) {
                const p = t - 1;
                
                const eventClaim = findEvent<RewardsClaimedEvent>(result, 'RewardsClaimed', p);
                expect(eventClaim.args.amount).to.be.equal(stakers.alice.rewards[p]);
            
                const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', t + 1);
                expect(eventTransfer.args.from).to.be.equal(stakingContract.address);
                expect(eventTransfer.args.to).to.be.equal(accounts.alice.address);
                expect(eventTransfer.args.value).to.be.equal(stakers.alice.rewards[p]);
            }
            
            // check balances
            const postContractBalance = await tokenMain.balanceOf(stakingContract.address);
            const deltaContractBalance = preContractBalances[0].sub(postContractBalance);
            expect(deltaContractBalance).to.be.equal(tokenFormat(10000));
            
            const postAliceBalance = await tokenMain.balanceOf(accounts.alice.address);
            const deltaAliceBalance = postAliceBalance.sub(preAliceBalances[0]);
            expect(deltaAliceBalance).to.be.equal(tokenFormat(10000));
            
            for (let t = 0; t < 3; ++t) {
                const i = t + 1;
                
                const postContractBalance = await tokenRewards[t].balanceOf(stakingContract.address);
                const deltaContractBalance = preContractBalances[i].sub(postContractBalance);
                expect(deltaContractBalance).to.be.equal(stakers.alice.rewards[t]);
                
                const postAliceBalance = await tokenRewards[t].balanceOf(accounts.alice.address);
                const deltaAliceBalance = postAliceBalance.sub(preAliceBalances[i]);
                expect(deltaContractBalance).to.be.equal(stakers.alice.rewards[t]);
            }
        }
    });
    
});
