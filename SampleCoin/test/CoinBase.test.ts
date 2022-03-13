import { CoinBase, TransferEvent } from '@/CoinBase';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { coinName, coinSymbol, Factory, initialSupply } from './fixtures/contracts';
import { assertErrorMessage, findEvent } from './helpers/utils';


const contractsToTest = [
    'CoinBase',
    'SampleCoin'
];

contractsToTest.forEach(contractName => {
    
    describe(`${contractName} is CoinBase`, () => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : CoinBase;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            contract = <any> await Factory[contractName]();
        });
        
        it('Should define proper initial values', async() => {
            const name = await contract.name();
            expect(name).to.be.equal(coinName);
            
            const symbol = await contract.symbol();
            expect(symbol).to.be.equal(coinSymbol);
            
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.be.equal(initialSupply);
            
            const ownerBalance = await contract.balanceOf(owner.address);
            expect(ownerBalance).to.be.equal(initialSupply);
        });
        
        describe('Direct transfers', () => {
            it('Allow simple transfers', async() => {
                {
                    const tx = await contract
                        .connect(owner)
                        .transfer(alice.address, 1000);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Transfer');
                    expect(event.args).to.containSubset([
                        owner.address,
                        alice.address,
                    ]);
                    expect(event.args.value).to.be.equal(1000);
                    
                    const senderBalance = await contract.balanceOf(owner.address);
                    expect(senderBalance).to.be.equal(999000);
                    
                    const recipientBalance = await contract.balanceOf(alice.address);
                    expect(recipientBalance).to.be.equal(1000);
                }
                
                {
                    const tx = await contract
                        .connect(alice)
                        .transfer(bob.address, 500);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Transfer');
                    expect(event.args).to.containSubset([
                        alice.address,
                        bob.address,
                    ]);
                    expect(event.args.value).to.be.equal(500);
                    
                    const senderBalance = await contract.balanceOf(alice.address);
                    expect(senderBalance).to.be.equal(500);
                    
                    const recipientBalance = await contract.balanceOf(bob.address);
                    expect(recipientBalance).to.be.equal(500);
                }
                
                {
                    const tx = await contract
                        .connect(bob)
                        .transfer(owner.address, 250);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Transfer');
                    expect(event.args).to.containSubset([
                        bob.address,
                        owner.address,
                    ]);
                    expect(event.args.value).to.be.equal(250);
                    
                    const senderBalance = await contract.balanceOf(bob.address);
                    expect(senderBalance).to.be.equal(250);
                    
                    const recipientBalance = await contract.balanceOf(owner.address);
                    expect(recipientBalance).to.be.equal(999250);
                }
            });
            
            it('Don`t allow transfering more than you have', async() => {
                {
                    const tx = contract
                        .connect(owner)
                        .transfer(alice.address, 1000001);
                    await assertErrorMessage(tx, 'InsufficientFunds(1000001, 1000000)');
                }
                
                {
                    const tx = await contract
                        .connect(owner)
                        .transfer(alice.address, 1000);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = contract
                        .connect(alice)
                        .transfer(bob.address, 1001);
                    await assertErrorMessage(tx, 'InsufficientFunds(1001, 1000)');
                }
            });
            
            it('Don`t allow transfering 0', async() => {
                {
                    const tx = contract
                        .connect(owner)
                        .transfer(alice.address, 0);
                    await assertErrorMessage(tx, 'WrongAmount(0)');
                }
            });
        });
        
        
        describe('Allowed transfers', () => {
            it('Proper approve execution', async() => {
                {
                    const tx = await contract
                        .connect(owner)
                        .approve(alice.address, 1000);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Approval');
                    expect(event.args).to.containSubset([
                        owner.address,
                        alice.address,
                    ]);
                    expect(event.args.value).to.be.equal(1000);
                    
                    // balance unchanged
                    const aBalance = await contract.balanceOf(owner.address);
                    expect(aBalance).to.be.equal(1000000);
                    
                    const bBalance = await contract.balanceOf(alice.address);
                    expect(bBalance).to.be.equal(0);
                    
                    // allowance changed
                    const allowance = await contract.allowance(owner.address, alice.address);
                    expect(allowance).to.be.equal(1000);
                }
                
                // change
                {
                    const tx = await contract
                        .connect(owner)
                        .approve(alice.address, 100);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Approval');
                    expect(event.args).to.containSubset([
                        owner.address,
                        alice.address,
                    ]);
                    expect(event.args.value).to.be.equal(100);
                    
                    // allowance changed
                    const allowance = await contract.allowance(owner.address, alice.address);
                    expect(allowance).to.be.equal(100);
                }
            });
            
            it('Allow approved value exceed account balance', async() => {
                {
                    const tx = await contract
                        .connect(alice)
                        .approve(bob.address, 10000);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Approval');
                    expect(event.args).to.containSubset([
                        alice.address,
                        bob.address,
                    ]);
                    expect(event.args.value).to.be.equal(10000);
                    
                    // balance unchanged
                    const aBalance = await contract.balanceOf(alice.address);
                    expect(aBalance).to.be.equal(0);
                    
                    const bBalance = await contract.balanceOf(bob.address);
                    expect(bBalance).to.be.equal(0);
                    
                    // allowance changed
                    const allowance = await contract.allowance(alice.address, bob.address);
                    expect(allowance).to.be.equal(10000);
                }
            });
            
            it('Transfer allowed amount', async() => {
                {
                    const tx = await contract
                        .connect(owner)
                        .approve(alice.address, 10000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = await contract
                        .connect(alice)
                        .transferFrom(owner.address, bob.address, 2500);
                    const result = await tx.wait();
                    
                    expect(result.status).to.be.equal(1);
                    
                    const event = findEvent<TransferEvent>(result, 'Transfer');
                    expect(event.args).to.containSubset([
                        owner.address,
                        bob.address,
                    ]);
                    expect(event.args.value).to.be.equal(2500);
                    
                    // balance changed
                    const aBalance = await contract.balanceOf(owner.address);
                    expect(aBalance).to.be.equal(997500);
                    
                    const bBalance = await contract.balanceOf(bob.address);
                    expect(bBalance).to.be.equal(2500);
                    
                    // allowance changed
                    const allowance = await contract.allowance(owner.address, alice.address);
                    expect(allowance).to.be.equal(7500);
                }
            });
            
            it('Should not allow transfer unallowed amount', async() => {
                {
                    const tx = contract
                        .connect(alice)
                        .transferFrom(owner.address, bob.address, 1);
                    await assertErrorMessage(tx, 'AmountExceedAllowed(1, 0)');
                }
                
                {
                    const tx = await contract
                        .connect(owner)
                        .approve(alice.address, 10000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = contract
                        .connect(alice)
                        .transferFrom(owner.address, bob.address, 10001);
                    await assertErrorMessage(tx, 'AmountExceedAllowed(10001, 10000)');
                }
                
                {
                    const tx = await contract
                        .connect(alice)
                        .transferFrom(owner.address, bob.address, 5000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = await contract
                        .connect(alice)
                        .transferFrom(owner.address, bob.address, 2500);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = contract
                        .connect(alice)
                        .transferFrom(owner.address, bob.address, 2501);
                    await assertErrorMessage(tx, 'AmountExceedAllowed(2501, 2500)');
                }
            });
            
            it('Should not allow transfer amount exceeding balance', async() => {
                {
                    const tx = await contract
                        .connect(alice)
                        .approve(bob.address, 10000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = await contract
                        .connect(owner)
                        .transfer(alice.address, 1000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = contract
                        .connect(bob)
                        .transferFrom(alice.address, bob.address, 1001);
                    await assertErrorMessage(tx, 'InsufficientFunds(1001, 1000)');
                }
            });
            
            it('Should not allow transfer wrong amount', async() => {
                {
                    const tx = contract
                        .connect(bob)
                        .transferFrom(alice.address, bob.address, 0);
                    await assertErrorMessage(tx, 'WrongAmount(0)');
                }
                
                {
                    const tx = await contract
                        .connect(alice)
                        .approve(bob.address, 10000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = contract
                        .connect(bob)
                        .transferFrom(alice.address, bob.address, 0);
                    await assertErrorMessage(tx, 'WrongAmount(0)');
                }
                
                {
                    const tx = await contract
                        .connect(owner)
                        .transfer(alice.address, 1000);
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                {
                    const tx = contract
                        .connect(bob)
                        .transferFrom(alice.address, bob.address, 0);
                    await assertErrorMessage(tx, 'WrongAmount(0)');
                }
            });
            
        });
    });
    
});
