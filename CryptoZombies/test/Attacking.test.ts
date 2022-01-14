import { NewZombieEvent } from '@/Feeding';
import { Attacking } from '@/Attacking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, findEvent, timetravel } from './helpers/utils';
import { MockContract, smock } from '@defi-wonderland/smock';


const zombieNames = [
    'Zombie #1',
    'Zombie #2'
];


const contractsToTest = [
    'Attacking',
    'CryptoZombies',
];

contractsToTest.forEach(contractToTest => {

    describe(`${contractToTest} is Attacking`, async() => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : MockContract<Attacking>;
        
        const zombies : any = {
            alice: null,
            bob: null,
        };
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            
            const contractFactory = await smock.mock(contractToTest, owner);
            contract = <any>await contractFactory.deploy();
            await contract.deployed();
            
            {
                const tx = await contract
                    .connect(alice)
                    .createRandomZombie('Alice zombie');
                const result = await tx.wait();
                
                zombies.alice = findEvent<NewZombieEvent>(result, 'NewZombie').args.zombieId;
            }
            
            {
                const tx = await contract
                    .connect(bob)
                    .createRandomZombie('Bob zombie');
                const result = await tx.wait();
                zombies.bob = findEvent<NewZombieEvent>(result, 'NewZombie').args.zombieId;
            }
        });
        
        it('Cant attack self', async() => {
            const tx = contract
                .connect(bob)
                .attack(zombies.bob, zombies.bob);
            await assertErrorMessage(
                tx,
                `WrongAttackTarget(${zombies.bob}, ${zombies.bob})`
            );
        });
        
        it('Allow to attack only with owned zombie', async() => {
            const tx = contract
                .connect(bob)
                .attack(zombies.alice, zombies.bob);
            await assertErrorMessage(
                tx,
                `NotOwnerOfZombie(${zombies.alice})`
            );
        });
        
        it('Allow to attack only when ready', async() => {
            {
                const tx = contract
                    .connect(bob)
                    .attack(zombies.bob, zombies.alice);
                await assertErrorMessage(
                    tx,
                    `ZombieIsNotReady(${zombies.bob})`
                );
            }
            
            await timetravel(24 * 3600);
            
            {
                const tx = await contract
                    .connect(bob)
                    .attack(zombies.bob, zombies.alice);
                const result = await tx.wait();
            
                expect(result.status).to.equal(1);
            }
        });
        
        it('Successful attack', async() => {
            await timetravel(24 * 3600);
            
            await contract.setVariable('attackVictoryProbability', 100);
    
            const tx = await contract
                .connect(bob)
                .attack(zombies.bob, zombies.alice);
            const result = await tx.wait();
        
            expect(result.status).to.equal(1);
            
            const newZombieEvent = findEvent<NewZombieEvent>(result, 'NewZombie');
            expect(newZombieEvent).to.containSubset({
                event: 'NewZombie',
                args: { 1: 'NoName' }
            });
            
            const bobZombie = await contract.zombies(zombies.bob);
            expect(bobZombie.winCount).to.equal(1);
            expect(bobZombie.level).to.equal(2);
            
            const aliceZombie = await contract.zombies(zombies.alice);
            expect(aliceZombie.lossCount).to.equal(1);
            
            // check cooldown
            {
                const tx = contract
                    .connect(bob)
                    .attack(zombies.bob, zombies.alice);
                await assertErrorMessage(
                    tx,
                    `ZombieIsNotReady(${zombies.bob})`
                );
            }
        });
        
        it('Failed attack', async() => {
            await timetravel(24 * 3600);
            
            await contract.setVariable('attackVictoryProbability', 0);
        
            const tx = await contract
                .connect(bob)
                .attack(zombies.bob, zombies.alice);
            const result = await tx.wait();
        
            expect(result.status).to.equal(1);
            
            const bobZombie = await contract.zombies(zombies.bob);
            expect(bobZombie.lossCount).to.equal(1);
            expect(bobZombie.level).to.equal(1);
            
            const aliceZombie = await contract.zombies(zombies.alice);
            expect(aliceZombie.winCount).to.equal(1);
            
            // check cooldown
            {
                const tx = contract
                    .connect(bob)
                    .attack(zombies.bob, zombies.alice);
                await assertErrorMessage(
                    tx,
                    `ZombieIsNotReady(${zombies.bob})`
                );
            }
        });
        
    });

});
