import { ExtERC20 } from '@/ExtERC20';
import { RewardPoolModifiedEvent, RewardsClaimedEvent, Staking } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers, network } from 'hardhat';
import colors from 'colors';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import { findEvent, getSigners, mineBlock, Signers, tokenFormat, waitForTxs } from '../helpers/utils';



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



xdescribe('Staking / Rewards distribution', async() => {
    let accounts : Partial<Signers> = {};
    
    let tokenMain : ExtERC20;
    let tokenRewards : { [i : number] : ExtERC20 } = {};
    
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
    
    
    it('Should properly distribute token for single staker', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Check state before any action
        {
            await checkStakers('alice');
        }
        
        // Alice stakes 1000
        {
            const txs = await stakeTokens({ alice: tokenFormat(10000) });
            await mineBlock();
            await waitForTxs(txs);
            
            // directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await checkStakers('alice');
            await checkShares({ alice: 1 });
        }
        
        // Mine next block (50 seconds later)
        {
            await mineBlock(50);
            
            // Shares factor didn't change
            // Still Alice has 100% shares so she should get all rewards
            addLocalRewards({ alice: 1 }, 50);
            
            await checkStakers('alice');
            await checkShares({ alice: 1 });
        }
        
        // Next stake (100 seconds later)
        // rewards should be distributed as it may change share ratio
        {
            const txs = await stakeTokens({ alice: tokenFormat(20000) });
            await mineBlock(100);
            await waitForTxs(txs);
            
            // Alice should still have 100% shares so all rewards goes to her
            // since inital stake 100 seconds passed
            addLocalRewards({ alice: 1 }, 100);
            
            await checkStakers('alice');
            await checkShares({ alice: 1 });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            // Still Alice has 100% shares so she should get all rewards
            addLocalRewards({ alice: 1 }, 100);
            
            await checkStakers('alice');
            await checkShares({ alice: 1 });
        }
        
        // Mine next block (10000 seconds later)
        // Pool 2 and 3 expired
        {
            await mineBlock(10000);
            
            addLocalRewards({ alice: 1 }, [ 9750, 10000, 750 ]);
            
            await checkStakers('alice');
            await checkShares({ alice: 1 });
        }
    });
    
    
    it('Should properly share rewards', async() => {
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
            
            // Directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await checkStakers('alice', 'bob', 'carol');
            await checkShares({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5,
            });
        }
        
        // Mine next block (50 seconds later)
        {
            await mineBlock(50);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 50);
            
            await checkStakers('alice', 'bob', 'carol');
            await checkShares({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5,
            });
        }
        
        // Alice stakes additional amount
        {
            const txs = await stakeTokens({
                alice: tokenFormat(20000),
            });
            await mineBlock(50);
            await waitForTxs(txs);
            
            // Distribute rewards using previous ratio (25%, 25%, 50%)
            addLocalRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 50);
            
            // Final share ratio is
            // Alice:   30000 + (100 + 250 + 50) * (50 + 50) * 0.25 = 40000 (40%)
            // Bob:     10000 + (100 + 250 + 50) * (50 + 50) * 0.25 = 20000 (20%)
            // Carol:   20000 + (100 + 250 + 50) * (50 + 50) * 0.50 = 40000 (40%)
            
            await checkShares({
                alice: 0.4,
                bob: 0.2,
                carol: 0.4,
            });
            await checkStakers('alice', 'bob', 'carol');
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(50);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.4,
                bob: 0.2,
                carol: 0.4
            }, 50);
            
            await checkShares({
                alice: 0.4,
                bob: 0.2,
                carol: 0.4,
            });
            await checkStakers('alice', 'bob', 'carol');
        }
        
        // 100s later new user Dave stakes
        {
            const txs = await stakeTokens({
                dave: tokenFormat(84000),
            });
            await mineBlock(50);
            await waitForTxs(txs);
            
            // Distribute rewards using previous ratio (40%, 20%, 40%)
            addLocalRewards({
                alice: 0.40,
                bob: 0.20,
                carol: 0.40,
            }, 50);
            
            // Final share ratio is
            // Alice:   30000 + 10000 + (100 + 250 + 50) * (50 + 50) * 0.4 = 56000 (25.0%)
            // Bob:     10000 + 10000 + (100 + 250 + 50) * (50 + 50) * 0.2 = 28000 (12.5%)
            // Carol:   20000 + 20000 + (100 + 250 + 50) * (50 + 50) * 0.4 = 56000 (25.0%)
            // Dave:    84000 = 84000 (37.5%)
            
            await checkShares({
                alice: 0.25,
                bob: 0.125,
                carol: 0.25,
                dave: 0.375
            });
            await checkStakers('alice', 'bob', 'carol', 'dave');
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.125,
                carol: 0.25,
                dave: 0.375
            }, 100);
            
            await checkShares({
                alice: 0.25,
                bob: 0.125,
                carol: 0.25,
                dave: 0.375
            });
            await checkStakers('alice', 'bob', 'carol', 'dave');
        }
        
        // Mine next block (10000 seconds later)
        // Pool 2 and 3 expired
        {
            await mineBlock(10000);
            
            addLocalRewards({
                alice: 0.25,
                bob: 0.125,
                carol: 0.25,
                dave: 0.375
            }, [ 9700, 10000, 700 ]);
            
            await checkShares({
                alice: 0.25,
                bob: 0.125,
                carol: 0.25,
                dave: 0.375
            });
            await checkStakers('alice', 'bob', 'carol', 'dave');
        }
    });
    
    
    it('Rewards distribution after pool change', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Check state before any action
        {
            await checkStakers('alice', 'bob');
        }
        
        // Alice and Bob stakes
        {
            const txs = await stakeTokens({
                alice: tokenFormat(1000),
                bob: tokenFormat(3000),
            });
            await mineBlock();
            await waitForTxs(txs);
            
            // directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Change pool params
        {
            const tx = await stakingContract.connect(accounts.owner)
                .modifyRewardPool(0, 20000);
            await mineBlock(100);
            
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            // add and check rewards using previos ratio
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
            
            // update new rewards per second
            pools[0].rewardRatio = tokenFormat(1e6)
                .sub(stakers.alice.rewards[0])
                .sub(stakers.bob.rewards[0])
                .div(20000);
                
            // check reward/s in state
            const rewardPool = await stakingContract.rewardPools(0);
            expect(rewardPool.rewardRatio).to.be.equal(pools[0].rewardRatio);
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Mine next block (20000 seconds later)
        // Pool 2 and 3 expired
        {
            await mineBlock(20000);
            
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, [ 19900, 19700, 700 ]);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
    });
    
    
    it('Rewards distribution after claiming rewards', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Check state before any action
        {
            await checkStakers('alice');
        }
        
        // Alice & Bob stakes
        {
            const txs = await stakeTokens({
                alice: tokenFormat(1000),
                bob: tokenFormat(3000),
            });
            await mineBlock();
            await waitForTxs(txs);
            
            // directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Claim rewards
        {
            const tx = await stakingContract.connect(accounts.alice)
                .claimAllRewards();
            await mineBlock(100);
            
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            // distribute rewards
            addLocalRewards({
                alice: 0.25,
                bob: 0.75
            }, 100);
            
            // clear rewards
            stakers.alice.rewards[0] = BigNumber.from(0);
            stakers.alice.rewards[1] = BigNumber.from(0);
            stakers.alice.rewards[2] = BigNumber.from(0);
            
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
    });
    
    
    it('Rewards distribution after withdrawing', async() => {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        // Check state before any action
        {
            await checkStakers('alice');
        }
        
        // Alice & Bob stakes
        {
            const txs = await stakeTokens({
                alice: tokenFormat(1000),
                bob: tokenFormat(3000),
            });
            await mineBlock();
            await waitForTxs(txs);
            
            // directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Claim rewards
        {
            const tx = await stakingContract.connect(accounts.alice)
                .withdraw();
            await mineBlock(100);
            
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            addLocalRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);
            
            // clear rewards & stake
            stakers.alice.rewards[0] = BigNumber.from(0);
            stakers.alice.rewards[1] = BigNumber.from(0);
            stakers.alice.rewards[2] = BigNumber.from(0);
            stakers.alice.stake = BigNumber.from(0);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                bob: 1
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            addLocalRewards({ bob: 1, }, 100);
            
            await checkStakers('alice', 'bob');
            await checkShares({
                bob: 1
            });
        }
    
    });
    
});
